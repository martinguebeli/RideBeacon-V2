#!/usr/bin/env node
// Registers the bot's webhook with Telegram. Run once after creating the bot
// via @BotFather and setting the env vars on Render:
//
//   TELEGRAM_BOT_TOKEN=123:abc TELEGRAM_WEBHOOK_SECRET=... \
//   BASE_URL=https://ridebeacon-backend.onrender.com \
//   node scripts/set-telegram-webhook.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const baseUrl = process.env.BASE_URL;

if (!token || !secret || !baseUrl) {
  console.error('Missing env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, BASE_URL');
  process.exit(1);
}

async function main() {
  const api = `https://api.telegram.org/bot${token}`;

  const me = await (await fetch(`${api}/getMe`)).json();
  if (!me.ok) throw new Error(`getMe failed: ${JSON.stringify(me)}`);
  console.log(`Bot: @${me.result.username} (${me.result.first_name})`);

  const set = await (await fetch(`${api}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${baseUrl}/webhook/telegram`,
      secret_token: secret,
      allowed_updates: ['message'],
    }),
  })).json();
  if (!set.ok) throw new Error(`setWebhook failed: ${JSON.stringify(set)}`);

  const info = await (await fetch(`${api}/getWebhookInfo`)).json();
  console.log('Webhook:', info.result.url, '| pending:', info.result.pending_update_count);
  console.log(`Done. Opt-in link format: https://t.me/${me.result.username}?start=<deviceId>`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
