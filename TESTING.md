# RideBeacon V2 — Kanäle produktiv testen

Backend-URL: `https://ridebeacon-backend.onrender.com` (Render, Auto-Deploy von `main`).

## Grund-Smoke-Test

```bash
BASE=https://ridebeacon-backend.onrender.com
curl $BASE/health                                    # → { status: ok, version: 3.0.0 }
curl -X POST $BASE/api/device/register -H 'Content-Type: application/json' \
  -d '{"deviceId":"test-device-1"}'
open "$BASE/setup/test-device-1"                     # Setup-Seite (Kanalwahl)
```

Nachricht senden (nachdem ein Kanal verbunden ist):

```bash
curl -X POST $BASE/api/device/send -H 'Content-Type: application/json' \
  -d '{"deviceId":"test-device-1","message":"Testfahrt gestartet 🚴"}'
```

## SMS (AWS SNS)

Der SNS-Account ist im **Sandbox-Modus** (Spend-Limit 1 USD/Monat): SMS gehen
nur an verifizierte Nummern. Eigene Nummer verifizieren (AWS-Creds in env):

```bash
cd backend
node scripts/sms-sandbox.js add +4179XXXXXXX        # schickt OTP-SMS
node scripts/sms-sandbox.js verify +4179XXXXXXX 123456
node scripts/sms-sandbox.js send +4179XXXXXXX "Direkttest"
```

Danach auf der Setup-Seite SMS wählen → Nummer eintragen → `/api/device/send`.
Für Produktion: In der AWS-Konsole (SNS → Text messaging) „Exit SMS sandbox"
beantragen und das Spend-Limit erhöhen.

## Telegram

1. In Telegram **@BotFather** öffnen → `/newbot` → Name „RideBeacon", Username
   z. B. `RideBeaconBot` → Token kopieren.
2. Auf Render (Service `ridebeacon-backend` → Environment) setzen:
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`
   (zufälliger String).
3. Webhook registrieren:
   ```bash
   cd backend
   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
   BASE_URL=https://ridebeacon-backend.onrender.com \
   node scripts/set-telegram-webhook.js
   ```
4. Testen: Setup-Seite → „Telegram" → Bot öffnet sich → Start →
   `/api/device/send` schicken.

## WhatsApp (Meta Cloud API)

1. [developers.facebook.com](https://developers.facebook.com) → App erstellen
   (Typ „Business") → Produkt **WhatsApp** hinzufügen. Die Test-Nummer +
   temporärer Token reichen zum Testen (Empfänger müssen als Testnummern
   eingetragen sein).
2. Message-Template `ride_notification` anlegen (Kategorie Utility, Body:
   `{{1}}`) und auf Freigabe warten.
3. Auf Render setzen: `WHATSAPP_ACCESS_TOKEN` (für Dauerbetrieb: System-User-
   Token, nicht der 24h-Testtoken), `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_TEMPLATE_NAME=ride_notification`, `WHATSAPP_TEMPLATE_LANG=en_US`.
4. Testen: Setup-Seite → WhatsApp → Nummer + Consent → `/api/device/send`.

## Stripe (Test-Mode)

Webhook-Endpoint zeigt auf `$BASE/webhook/stripe`
(Events: `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`). `STRIPE_WEBHOOK_SECRET` auf Render muss zum
Endpoint passen. Checkout testen mit Karte `4242 4242 4242 4242`.
