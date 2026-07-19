# SMS mit AWS SNS — RideBeacon V2

Stand: 19.07.2026. Der SMS-Kanal ist **end-to-end getestet und funktioniert**
(Test-SMS über den vollen Produktionspfad an +41 79 404 18 81 zugestellt).

## Setup-Überblick

| | |
|---|---|
| AWS-Region | `eu-north-1` (Stockholm) |
| IAM-Access-Key | `AKIATSAOICETTHOQETZE` (Secret in `backend/.env`, gitignored) |
| Account-Status | **SMS-Sandbox** (siehe unten) |
| Spend-Limit | **1 USD/Monat** (AWS-Default) |
| Verifizierte Nummern | +41794041881 (Martin) |
| SMS-Typ | `Transactional` (höhere Zustellpriorität als Promotional) |
| Absender-ID | `RideBeacon` (alphanumerisch) |
| Backend live | `https://ridebeacon-backend-kknw.onrender.com` |

## Wie der Versand funktioniert (Code-Pfad)

1. Karoo-App ruft `POST /api/device/send` mit `{ deviceId, message }` auf
   ([backend/src/routes/notify.js](backend/src/routes/notify.js)).
2. Trial-/Abo-Prüfung: 7-Tage-Trial ist auf den ersten gewählten Kanal
   gelockt; danach Stripe-Abo nötig.
3. [backend/src/services/notify.js](backend/src/services/notify.js) löst den
   Kanal auf und holt die `phone_number` des Geräts aus Postgres.
4. [backend/src/services/channels/sms.js](backend/src/services/channels/sms.js)
   schickt per `@aws-sdk/client-sns` einen `PublishCommand` direkt an die
   E.164-Nummer (kein Topic).

Die Nummer landet über die Setup-Seite (`/setup/<deviceId>`, per QR-Code vom
Karoo gescannt) in der DB.

## Sandbox-Modus — das Wichtigste

Der SNS-Account ist im **SMS-Sandbox-Modus**: `Publish` wird zwar mit
`success` + MessageId angenommen, **zugestellt wird aber nur an verifizierte
Nummern** — an alle anderen wird die SMS still verworfen. Ein „success" von
der API heißt also nicht automatisch, dass die SMS ankommt.

Nummern verwalten mit dem Helper-Skript (lädt `backend/.env` automatisch):

```bash
cd backend
node scripts/sms-sandbox.js status                    # Sandbox? Verifizierte Nummern?
node scripts/sms-sandbox.js add +41791234567          # schickt OTP-SMS an die Nummer
node scripts/sms-sandbox.js verify +41791234567 969864
node scripts/sms-sandbox.js send +41791234567 "Test"  # Direktversand (ohne Backend)
```

End-to-end über das Produktiv-Backend testen:

```bash
BASE=https://ridebeacon-backend-kknw.onrender.com
curl -X POST $BASE/api/device/register -H 'Content-Type: application/json' -d '{"deviceId":"mein-test"}'
curl -X POST $BASE/setup/mein-test/sms -d 'phone=%2B41794041881'
curl -X POST $BASE/api/device/send -H 'Content-Type: application/json' \
  -d '{"deviceId":"mein-test","message":"Testfahrt gestartet"}'
```

## Für den echten Betrieb (vor Launch nötig)

1. **Sandbox verlassen**: AWS-Konsole → SNS → *Text messaging (SMS)* →
   *Exit SMS sandbox*. Das ist ein Support-Antrag (Use-Case beschreiben:
   transaktionale Ride-Benachrichtigungen, Opt-in über Setup-Seite);
   Freigabe dauert typischerweise ~24 h.
2. **Spend-Limit erhöhen**: ebenfalls per Support-Antrag (Service limit
   increase → SNS Text Messaging). 1 USD/Monat ≈ nur wenige Dutzend SMS.
3. **Kosten im Blick behalten**: SMS in die Schweiz kosten grob 0.07–0.08 USD
   pro Stück — bei vielen Fahrten summiert sich das; Telegram/WhatsApp sind
   praktisch gratis. Ggf. CloudWatch-Alarm auf `SMSMonthToDateSpentUSD`.
4. **Absender-ID-Einschränkung**: Die alphanumerische Absender-ID
   „RideBeacon" wird in den meisten Ländern angezeigt, aber **nicht in
   USA/Kanada** (dort erscheint eine generische Long-Code-Nummer; für US
   bräuchte man ein 10DLC/Toll-Free-Nummern-Setup). Einige Länder (z. B.
   Indien) verlangen registrierte Sender-IDs.

## Troubleshooting

- **„Could not load credentials from any providers"**: Skript ohne `.env`
  gestartet — die Skripte laden `backend/.env` inzwischen selbst; prüfen,
  dass die Datei existiert und AWS-Keys enthält.
- **API sagt success, SMS kommt nicht an**: fast immer Sandbox (Nummer nicht
  verifiziert) oder Monats-Spend-Limit erreicht. `node scripts/sms-sandbox.js
  status` prüfen.
- **Zustell-Reports**: In der AWS-Konsole unter SNS → Text messaging →
  *Delivery status logging* aktivierbar (CloudWatch Logs), um pro SMS
  Erfolg/Fehlschlag zu sehen.
