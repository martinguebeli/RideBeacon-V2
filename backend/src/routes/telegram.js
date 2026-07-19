const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /webhook/telegram
// Configured as the bot's webhook URL via Telegram's setWebhook API.
// Handles: user taps https://t.me/<bot>?start=<deviceId> -> Telegram sends
// us an update with text "/start <deviceId>" -> we link chat_id to device.
//
// Verify requests actually come from Telegram using the secret token
// Telegram echoes back in this header (set via setWebhook's secret_token param).
router.post('/', async (req, res) => {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).send('Unauthorized');
  }

  const message = req.body?.message;
  const text = message?.text || '';
  const chatId = message?.chat?.id;

  if (text.startsWith('/start') && chatId) {
    const deviceId = text.split(' ')[1];
    if (deviceId) {
      await db.linkTelegramChat(deviceId, String(chatId));
      await sendTelegramReply(chatId,
        'RideBeacon is connected! You\'ll receive ride notifications here.');
    }
  }

  // Always 200 — Telegram retries aggressively on non-2xx responses.
  res.sendStatus(200);
});

async function sendTelegramReply(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    console.error('Failed to send Telegram opt-in confirmation:', err);
  }
}

module.exports = router;
