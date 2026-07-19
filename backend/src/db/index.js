const { Pool } = require('pg');
const { TRIAL_DAYS } = require('../services/license');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id              TEXT PRIMARY KEY,

      -- trial state: locked to the first channel the user picks.
      -- Trial is time-based (7 days from first channel link), not a message
      -- count, and applies the same way regardless of channel.
      trial_channel           TEXT,
      trial_started_at        TIMESTAMPTZ,

      -- channel delivery identifiers
      phone_number            TEXT,
      telegram_chat_id        TEXT,
      whatsapp_number         TEXT,
      whatsapp_consent_at     TIMESTAMPTZ,  -- documents opt-in for Meta's business-initiated messaging policy

      -- which channel to use once the device is a paying subscriber
      preferred_channel        TEXT,

      -- Stripe subscription state (source of truth for entitlement)
      stripe_customer_id       TEXT,
      stripe_subscription_id   TEXT,
      subscription_status      TEXT,       -- active | past_due | canceled | incomplete | null
      current_period_end       TIMESTAMPTZ,

      -- legacy self-signed license key, kept for the app's offline cache
      license_key              TEXT,
      licensed_until            TIMESTAMPTZ,

      created_at               TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Migrate a pre-multichannel (V1) devices table in place — CREATE TABLE IF
  // NOT EXISTS above is a no-op when the table already exists, so the new
  // columns have to be added explicitly.
  await pool.query(`
    ALTER TABLE devices
      ADD COLUMN IF NOT EXISTS trial_channel          TEXT,
      ADD COLUMN IF NOT EXISTS trial_started_at       TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS phone_number           TEXT,
      ADD COLUMN IF NOT EXISTS telegram_chat_id       TEXT,
      ADD COLUMN IF NOT EXISTS whatsapp_number        TEXT,
      ADD COLUMN IF NOT EXISTS whatsapp_consent_at    TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS preferred_channel      TEXT,
      ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
      ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
      ADD COLUMN IF NOT EXISTS subscription_status    TEXT,
      ADD COLUMN IF NOT EXISTS current_period_end     TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS license_key            TEXT,
      ADD COLUMN IF NOT EXISTS licensed_until         TIMESTAMPTZ;
  `);
  console.log('Database ready');
}

async function getDevice(deviceId) {
  const { rows } = await pool.query('SELECT * FROM devices WHERE device_id = $1', [deviceId]);
  return rows[0] || null;
}

async function registerDevice(deviceId) {
  const { rows } = await pool.query(
    `INSERT INTO devices (device_id) VALUES ($1)
     ON CONFLICT (device_id) DO UPDATE SET device_id = EXCLUDED.device_id
     RETURNING *`,
    [deviceId]
  );
  return rows[0];
}

// Called the first time a device picks a channel (trial phase only).
// Locks trial_channel and starts the 7-day trial clock — both only ever apply to the first channel picked.
async function notifyDeviceChanged(deviceId) {
  await pool.query('SELECT pg_notify($1, $2)', ['device_updates', deviceId]);
}

async function setChannelIdentifier(deviceId, channel, identifier, { whatsappConsent = false } = {}) {
  const column = {
    sms: 'phone_number',
    telegram: 'telegram_chat_id',
    whatsapp: 'whatsapp_number',
  }[channel];
  if (!column) throw new Error(`Unknown channel: ${channel}`);

  const { rows } = await pool.query(
    `UPDATE devices
     SET ${column} = $2,
         trial_channel = COALESCE(trial_channel, $3),
         trial_started_at = COALESCE(trial_started_at, NOW()),
         preferred_channel = COALESCE(preferred_channel, $3),
         whatsapp_consent_at = CASE WHEN $4 THEN NOW() ELSE whatsapp_consent_at END
     WHERE device_id = $1
     RETURNING *`,
    [deviceId, identifier, channel, whatsappConsent]
  );
  await notifyDeviceChanged(deviceId);
  return rows[0];
}

// Once subscribed, the user may switch freely between channels they've linked.
async function setPreferredChannel(deviceId, channel) {
  const { rows } = await pool.query(
    `UPDATE devices SET preferred_channel = $2 WHERE device_id = $1 RETURNING *`,
    [deviceId, channel]
  );
  return rows[0];
}

async function linkTelegramChat(deviceId, chatId) {
  const { rows } = await pool.query(
    `UPDATE devices
     SET telegram_chat_id = $2,
         trial_channel = COALESCE(trial_channel, 'telegram'),
         trial_started_at = COALESCE(trial_started_at, NOW()),
         preferred_channel = COALESCE(preferred_channel, 'telegram')
     WHERE device_id = $1
     RETURNING *`,
    [deviceId, chatId]
  );
  await notifyDeviceChanged(deviceId);
  return rows[0];
}

async function setSubscription(deviceId, { stripeCustomerId, stripeSubscriptionId, status, currentPeriodEnd, licenseKey }) {
  const { rows } = await pool.query(
    `UPDATE devices
     SET stripe_customer_id = COALESCE($2, stripe_customer_id),
         stripe_subscription_id = COALESCE($3, stripe_subscription_id),
         subscription_status = $4,
         current_period_end = $5,
         license_key = COALESCE($6, license_key),
         licensed_until = $5
     WHERE device_id = $1
     RETURNING *`,
    [deviceId, stripeCustomerId, stripeSubscriptionId, status, currentPeriodEnd, licenseKey]
  );
  await notifyDeviceChanged(deviceId);
  return rows[0];
}

async function getDeviceBySubscriptionId(stripeSubscriptionId) {
  const { rows } = await pool.query(
    'SELECT * FROM devices WHERE stripe_subscription_id = $1',
    [stripeSubscriptionId]
  );
  return rows[0] || null;
}

function isSubscriptionActive(device) {
  if (!device) return false;
  if (device.subscription_status !== 'active' && device.subscription_status !== 'past_due') return false;
  if (!device.current_period_end) return false;
  return new Date(device.current_period_end) > new Date();
}

// True while the device is within its 7-day trial window — applies the same
// way whether the device is on SMS, WhatsApp, or Telegram.
function isTrialActive(device) {
  if (!device || !device.trial_started_at) return false;
  const trialEnd = new Date(device.trial_started_at).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() < trialEnd;
}

function trialDaysRemaining(device) {
  if (!device || !device.trial_started_at) return TRIAL_DAYS;
  const trialEnd = new Date(device.trial_started_at).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((trialEnd - Date.now()) / (24 * 60 * 60 * 1000)));
}

module.exports = {
  init,
  getDevice,
  registerDevice,
  setChannelIdentifier,
  setPreferredChannel,
  linkTelegramChat,
  setSubscription,
  getDeviceBySubscriptionId,
  isSubscriptionActive,
  isTrialActive,
  trialDaysRemaining,
  notifyDeviceChanged,
};
