const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

// identifier here is the telegram chat_id captured via the /start deep link
// (see routes/telegram.js). The bot's own display name/username ("RideBeacon"
// or "@RideBeaconBot") is what the user sees as the sender — no per-message
// sender configuration needed, unlike SMS.
async function send(identifier, message) {
  const res = await fetch(`${API_BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: identifier,
      text: message,
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram send failed: ${data.description || res.status}`);
  }
  return data.result.message_id;
}

// Returns the deep link the app shows/opens so the user can opt in to the bot.
// Telegram requires this one-time handshake before the bot can message them.
function getOptInLink(deviceId) {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME; // e.g. RideBeaconBot
  return `https://t.me/${botUsername}?start=${encodeURIComponent(deviceId)}`;
}

module.exports = { send, getOptInLink };
