const express = require('express');
const router = express.Router();
const db = require('../db');
const notify = require('../services/notify');
const telegram = require('../services/channels/telegram');
const realtime = require('../services/realtime');

const VALID_CHANNELS = ['sms', 'telegram', 'whatsapp'];

// POST /api/device/register
router.post('/register', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

  const device = await db.registerDevice(deviceId);
  return res.json(deviceStatusPayload(device));
});

// POST /api/device/channel
// Links a delivery identifier to a channel for this device. The FIRST call
// (during trial) locks trial_channel — later calls (post-subscription) are
// how the user adds/updates identifiers for channels they want to switch to.
// Body: { deviceId, channel: 'sms'|'telegram'|'whatsapp', identifier }
// For telegram, identifier is optional here — it's normally set via the bot
// /start deep link instead (see routes/telegram.js + GET /telegram-link below).
router.post('/channel', async (req, res) => {
  const { deviceId, channel, identifier } = req.body;
  if (!deviceId || !channel) return res.status(400).json({ error: 'Missing deviceId or channel' });
  if (!VALID_CHANNELS.includes(channel)) return res.status(400).json({ error: 'Invalid channel' });

  const device = await db.getDevice(deviceId);
  if (!device) return res.status(404).json({ error: 'Device not registered' });

  // Once subscribed, switching channel doesn't require re-supplying an
  // identifier if it was already linked previously.
  if (db.isSubscriptionActive(device) && !identifier) {
    if (!notify.getIdentifier(device, channel)) {
      return res.status(400).json({ error: `Channel "${channel}" not linked yet — identifier required` });
    }
    const updated = await db.setPreferredChannel(deviceId, channel);
    return res.json(deviceStatusPayload(updated));
  }

  if (!identifier) return res.status(400).json({ error: 'Missing identifier' });

  const updated = await db.setChannelIdentifier(deviceId, channel, identifier);
  return res.json(deviceStatusPayload(updated));
});

// GET /api/device/telegram-link/:deviceId
// Returns the deep link the app opens so the user can opt in to the bot once.
router.get('/telegram-link/:deviceId', (req, res) => {
  res.json({ url: telegram.getOptInLink(req.params.deviceId) });
});

// POST /api/notify/send
// Body: { deviceId, message, channel? }
// channel is optional — defaults to preferred_channel (trial_channel pre-payment).
router.post('/send', async (req, res) => {
  const { deviceId, message, channel } = req.body;
  if (!deviceId || !message) return res.status(400).json({ error: 'Missing required fields' });

  const device = await db.getDevice(deviceId);
  if (!device) return res.status(404).json({ error: 'Device not registered' });

  const subscribed = db.isSubscriptionActive(device);
  const targetChannel = channel || device.preferred_channel || device.trial_channel;

  if (!targetChannel) {
    return res.status(400).json({ error: 'no_channel', message: 'No channel selected for this device yet' });
  }

  // Pre-payment: locked to whichever channel the trial started on.
  if (!subscribed && targetChannel !== device.trial_channel) {
    return res.status(403).json({
      error: 'channel_locked',
      message: `Free trial is locked to ${device.trial_channel}. Subscribe to unlock other channels.`,
    });
  }

  if (!subscribed && !db.isTrialActive(device)) {
    return res.status(402).json({
      error: 'trial_expired',
      message: 'Your 7-day trial has ended. Please subscribe to continue.',
    });
  }

  if (!notify.getIdentifier(device, targetChannel)) {
    return res.status(400).json({ error: 'channel_not_linked', message: `Channel "${targetChannel}" is not linked for this device` });
  }

  try {
    await notify.send(device, targetChannel, message);
  } catch (err) {
    console.error('Notify send error:', err);
    return res.status(500).json({ error: 'Failed to send message' });
  }

  return res.json({
    success: true,
    channel: targetChannel,
    subscribed,
    trialDaysRemaining: subscribed ? null : db.trialDaysRemaining(device),
  });
});

// GET /api/device/status/:deviceId
router.get('/status/:deviceId', async (req, res) => {
  const device = await db.getDevice(req.params.deviceId);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  return res.json(deviceStatusPayload(device));
});

// GET /api/device/status/:deviceId/wait?timeout=25000
// Long-poll variant: holds the connection open until the device's state
// actually changes (e.g. Stripe webhook activates the subscription, or a
// Telegram opt-in links a chat_id) or the timeout elapses — whichever first.
// The app should call this in a loop instead of polling /status every
// couple of seconds while showing the QR code or waiting on a Telegram link.
// Backed by Postgres LISTEN/NOTIFY (see services/realtime.js) — no DB
// polling happens while a request is waiting.
router.get('/status/:deviceId/wait', async (req, res) => {
  const { deviceId } = req.params;
  const timeoutMs = Math.min(parseInt(req.query.timeout, 10) || 25000, 30000);

  const device = await db.getDevice(deviceId);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  await realtime.waitForChange(deviceId, timeoutMs);

  const refreshed = await db.getDevice(deviceId);
  return res.json(deviceStatusPayload(refreshed));
});

function deviceStatusPayload(device) {
  const subscribed = db.isSubscriptionActive(device);
  return {
    deviceId: device.device_id,
    trialChannel: device.trial_channel,
    trialActive: db.isTrialActive(device),
    trialDaysRemaining: db.trialDaysRemaining(device),
    preferredChannel: device.preferred_channel,
    subscribed,
    subscriptionStatus: device.subscription_status,
    currentPeriodEnd: device.current_period_end,
    linkedChannels: {
      sms: !!device.phone_number,
      telegram: !!device.telegram_chat_id,
      whatsapp: !!device.whatsapp_number,
    },
  };
}

module.exports = router;
