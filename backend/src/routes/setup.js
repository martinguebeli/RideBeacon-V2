const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../db');
const telegram = require('../services/channels/telegram');

// GET /setup/qr/:deviceId
// The ONE QR code the Karoo ever shows — at first launch (to pick a channel)
// and again at the paywall (to subscribe / switch channels). Content behind
// the URL adapts to device state, so the app never needs to know which QR
// to show. Registered before /:deviceId so "qr" isn't swallowed as a deviceId.
router.get('/qr/:deviceId', async (req, res) => {
  const device = await db.getDevice(req.params.deviceId);
  if (!device) return res.status(404).json({ error: 'Device not registered' });

  const url = `${process.env.BASE_URL}/setup/${req.params.deviceId}`;
  const png = await QRCode.toBuffer(url, { width: 400, margin: 2 });
  res.set('Content-Type', 'image/png');
  res.send(png);
});

// GET /setup/:deviceId
router.get('/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const device = await db.getDevice(deviceId);
  if (!device) return res.status(404).send('Device not found. Please restart RideBeacon on your Karoo.');

  res.send(renderPage(deviceId, device));
});

// POST /setup/:deviceId/sms
// POST /setup/:deviceId/whatsapp
// Body: { phone: "+41791234567", consent?: "on" }
router.post('/:deviceId/:channel', async (req, res) => {
  const { deviceId, channel } = req.params;
  const { phone, consent } = req.body;

  if (!['sms', 'whatsapp'].includes(channel)) {
    return res.status(400).send('Invalid channel.');
  }

  const device = await db.getDevice(deviceId);
  if (!device) return res.status(404).send('Device not found.');

  const normalized = normalizePhone(phone);
  if (!normalized) {
    return res.status(400).send(renderPage(deviceId, device, {
      error: 'Please enter a valid phone number in international format, e.g. +41791234567.',
    }));
  }

  if (channel === 'whatsapp' && consent !== 'on') {
    return res.status(400).send(renderPage(deviceId, device, {
      error: 'Please check the box to confirm you agree to receive WhatsApp messages from RideBeacon.',
    }));
  }

  await db.setChannelIdentifier(deviceId, channel, normalized, {
    whatsappConsent: channel === 'whatsapp',
  });

  // Once subscribed, a resubmission here means the user is actively
  // switching channels — force preferred_channel to the new pick, since
  // setChannelIdentifier only sets it the FIRST time (trial lock behavior).
  if (db.isSubscriptionActive(device)) {
    await db.setPreferredChannel(deviceId, channel);
  }

  res.send(renderSuccessPage(channel, db.isSubscriptionActive(device)));
});

// GET /setup/:deviceId/telegram — redirects into the Telegram opt-in deep link
router.get('/:deviceId/telegram', async (req, res) => {
  const { deviceId } = req.params;
  const device = await db.getDevice(deviceId);
  if (!device) return res.status(404).send('Device not found.');

  if (db.isSubscriptionActive(device)) {
    await db.setPreferredChannel(deviceId, 'telegram');
  }
  res.redirect(telegram.getOptInLink(deviceId));
});

// GET /setup/:deviceId/subscribe — creates a Stripe Checkout session and
// redirects the phone's browser straight into it (no client-side JS needed).
router.get('/:deviceId/subscribe', async (req, res) => {
  const { deviceId } = req.params;
  const device = await db.getDevice(deviceId);
  if (!device) return res.status(404).send('Device not found.');

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${process.env.BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/setup/${deviceId}`,
    metadata: { deviceId },
  });

  res.redirect(session.url);
});

function normalizePhone(phone) {
  if (!phone) return null;
  const trimmed = phone.trim();
  return /^\+[1-9]\d{7,14}$/.test(trimmed) ? trimmed : null;
}

// Determines what this page should show for a given device.
function pageState(device) {
  const subscribed = db.isSubscriptionActive(device);
  const hasChannel = !!(device.phone_number || device.telegram_chat_id || device.whatsapp_number);

  if (subscribed) return 'subscribed';
  if (!hasChannel) return 'pick_channel';
  if (!db.isTrialActive(device)) return 'paywall';
  return 'trial_active';
}

function renderPage(deviceId, device, { error } = {}) {
  const state = pageState(device);

  const banner = {
    pick_channel: '',
    trial_active: `<div class="info">Connected via ${escapeHtml(device.trial_channel)} — ${db.trialDaysRemaining(device)} day${db.trialDaysRemaining(device) === 1 ? '' : 's'} left in your free trial.
      <a href="/setup/${deviceId}/subscribe">Subscribe</a> to unlock unlimited messages and other channels.</div>`,
    paywall: `<div class="warn">Your 7-day free trial has ended.
      <a class="cta" href="/setup/${deviceId}/subscribe">Subscribe to keep receiving ride notifications</a></div>`,
    subscribed: `<div class="info">You're subscribed! Pick a channel below to switch — you can change this anytime.</div>`,
  }[state];

  const heading = state === 'paywall'
    ? 'Trial ended'
    : state === 'subscribed'
      ? 'Switch channel'
      : 'Connect RideBeacon';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RideBeacon</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px 20px; color: #1a1a1a; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  p.sub { color: #666; margin-top: 0; margin-bottom: 24px; }
  .option { display: block; width: 100%; padding: 16px; margin-bottom: 12px; border: 1px solid #ddd; border-radius: 10px; background: #fff; font-size: 16px; text-align: left; cursor: pointer; box-sizing: border-box; text-decoration:none; color:inherit; }
  .option:active { background: #f5f5f5; }
  form.inline { display: none; margin-top: 12px; }
  form.inline.open { display: block; }
  input[type=tel] { width: 100%; padding: 12px; font-size: 16px; border: 1px solid #ccc; border-radius: 8px; box-sizing: border-box; margin-bottom: 12px; }
  button.submit { width: 100%; padding: 14px; font-size: 16px; border: none; border-radius: 8px; background: #1a1a1a; color: #fff; }
  label.consent { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #555; margin-bottom: 12px; }
  .error { background: #fdecea; color: #a52a1c; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
  .info { background: #eaf3fb; color: #1c4b6b; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; }
  .warn { background: #fdf3e3; color: #8a5a1c; padding: 14px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; }
  .info a, .warn a.cta { display: inline-block; margin-top: 8px; background: #1a1a1a; color: #fff; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 14px; }
</style>
</head>
<body>
  <h1>${heading}</h1>
  <p class="sub">${state === 'pick_channel' ? "Choose how you'd like to receive ride notifications." : ''}</p>

  ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
  ${banner}

  <button class="option" onclick="toggle('sms')">📱 SMS text message</button>
  <form class="inline" id="form-sms" method="POST" action="/setup/${deviceId}/sms">
    <input type="tel" name="phone" placeholder="+41 79 123 45 67" required>
    <button class="submit" type="submit">Continue</button>
  </form>

  <button class="option" onclick="toggle('whatsapp')">💬 WhatsApp</button>
  <form class="inline" id="form-whatsapp" method="POST" action="/setup/${deviceId}/whatsapp">
    <input type="tel" name="phone" placeholder="+41 79 123 45 67" required>
    <label class="consent"><input type="checkbox" name="consent" required> I agree to receive WhatsApp messages from RideBeacon.</label>
    <button class="submit" type="submit">Continue</button>
  </form>

  <a class="option" href="/setup/${deviceId}/telegram">✈️ Telegram</a>

  <script>
    function toggle(name) {
      document.querySelectorAll('form.inline').forEach(f => f.classList.remove('open'));
      document.getElementById('form-' + name).classList.add('open');
    }
  </script>
</body>
</html>`;
}

function renderSuccessPage(channel, wasSubscribed) {
  const label = { sms: 'SMS', whatsapp: 'WhatsApp', telegram: 'Telegram' }[channel] || channel;
  const body = wasSubscribed
    ? `You're now receiving ride notifications via ${escapeHtml(label)}.`
    : `You're connected via ${escapeHtml(label)}. Return to RideBeacon on your Karoo — it'll pick this up automatically.`;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connected</title>
<style>body{font-family:-apple-system,sans-serif;max-width:420px;margin:60px auto;padding:0 20px;text-align:center;color:#1a1a1a;}</style>
</head>
<body>
  <h1>Connected</h1>
  <p>${body}</p>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = router;
