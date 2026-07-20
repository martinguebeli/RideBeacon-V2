# WhatsApp mit Meta Cloud API — RideBeacon V2

Stand: 20.07.2026. Der WhatsApp-Kanal ist **end-to-end getestet** (Freitext im
24h-Fenster an +41 79 404 18 81 zugestellt). Es fehlen nur noch Schritte für
den öffentlichen Launch — siehe Fahrplan und Checkliste unten.

## Launch-Fahrplan (Reihenfolge)

Ziel: SMS + Telegram + WhatsApp ab Start anbieten, ~250 WhatsApp-Nutzer/Tag.

| Schritt | Wann | Blockiert Launch? |
|---|---|---|
| Frische Absendernummer besorgen + registrieren | vor Launch | ja (für echte WhatsApp-Nutzer) |
| Display-Name „RideBeacon" freigeben lassen | vor/kurz nach Launch | nein |
| Template abwarten (`ride_notification`) | läuft | nein (Freitext-Modus testet weiter) |
| Permanenten Token (2FA aktivieren!) | vor Launch | ja (Token läuft sonst ab) |
| Einzelfirma + Business-Verifizierung | wenn nahe an 250/Tag | nein |

### Absendernummer verstehen

- Die Testnummer (+1 555-146-4189) sendet nur an die 5 eingetragenen Testnummern
  — nutzlos für echte Kunden. Du brauchst eine eigene Nummer im WABA.
- Muss eine **frische Nummer** sein: aktuell KEIN WhatsApp-Konto darauf (weder
  normale noch Business-App). Falls doch, das Konto vorher in der App löschen.
- **Nicht deine private Nummer** — sobald sie in der Cloud API registriert ist,
  gehört sie der API und kann nicht mehr parallel als normales WhatsApp laufen.
  Empfehlung: günstige Prepaid-SIM / Zweitnummer.
- Registrierung = einmaliger SMS/Anruf-Code (Besitznachweis, keine „Verifizierung").
- Kostenlos beim Hinzufügen; Meta rechnet pro Konversation ab (bei niedrigem
  Volumen günstig). Diese EINE Nummer bedient zentral alle Nutzer.
- Empfänger sehen anfangs die Nummer, nach Display-Name-Freigabe „RideBeacon".

### Die 250/Tag richtig einordnen

- Für ~250 Nutzer/Tag zum Start braucht es KEINE Business-Verifizierung — nur
  echte Absendernummer + freigegebenes Template. Damit sendest du an beliebige
  (zustimmende) Nutzer bis 250 business-initiierte Gespräche pro 24 h.
- Verifizierung hebt das Limit erst darüber an (250 → 1k → 10k → unbegrenzt).
  Also: erst launchen, dann verifizieren, wenn man an die Grenze stößt.

### Einfachster Weg zur Verifizierung (wenn nötig)

- Meta will Name + Adresse + ein offizielles Dokument. Schweizer Solo-Weg:
  **Einzelunternehmen freiwillig ins Handelsregister eintragen** (~120 CHF,
  online, wenige Tage) → Handelsregisterauszug + UID = akzeptierte Dokumente.
- Die App-Webseite (Domain + geschäftliche E-Mail) hilft bei der Gegenprüfung.
- Hinweis: Da bereits Stripe-Abos eingenommen werden, ist geschäftliche
  Tätigkeit ohnehin gegeben — Einzelfirma legitimiert das Bezahlprodukt
  generell, Verifizierung fällt als Nebenprodukt ab. (Keine Rechts-/Steuer-
  beratung — Schweizer Details mit Kanton/Treuhänder gegenchecken.)

## Setup-Überblick

| | |
|---|---|
| Meta-App | `RideBeaconV2` (App-ID `1062661980056706`) |
| Business-Portfolio | RideBeacon |
| WhatsApp Business Account (WABA) | `1570341101104791` |
| Absendernummer (Test) | +1 555-146-4189 |
| Phone Number ID | `1222068930990517` |
| Message-Template | `ride_notification` (ID `1377892927605664`) |
| Backend live | `https://ridebeacon-backend-kknw.onrender.com` |

## Wie der Versand funktioniert

Zwei Sende-Modi in
[backend/src/services/channels/whatsapp.js](backend/src/services/channels/whatsapp.js),
gesteuert über die Env-Variable `WHATSAPP_FREETEXT`:

- **`WHATSAPP_FREETEXT=1` (Testmodus, aktuell aktiv):** sendet reinen Freitext.
  Funktioniert **nur** im 24h-Service-Fenster — d. h. der Empfänger muss der
  Absendernummer zuerst geschrieben haben. Gut zum Testen, solange das Template
  noch nicht freigegeben ist.
- **`WHATSAPP_FREETEXT=0` (Produktion):** sendet über das freigegebene Template
  `ride_notification`. Nötig für business-initiierte Nachrichten (Fahrt-
  Benachrichtigungen) außerhalb des 24h-Fensters. Body-Format:
  „New ride update: {{1}}. Sent by RideBeacon."

Der Rest des Pfades wie bei den anderen Kanälen: `/api/device/send` →
[notify.js](backend/src/services/notify.js) löst die `whatsapp_number` des
Geräts auf → Graph-API-Call.

## Wichtig: Business-Verifizierung ist KEIN Muss für den Launch

Die Meta-Business-Verifizierung wird oft mit der Template-Freigabe verwechselt —
sie sind unabhängig. Was wovon abhängt:

| Ohne Verifizierung möglich | Nur mit Verifizierung |
|---|---|
| Echte Absendernummer statt Testnummer | Höhere Sendelimits (1k → 10k → unbegrenzt/Tag) |
| Template-Freigabe | Grüner „Verified"-Haken beim Namen |
| Nachrichten an Kunden senden | — |
| Aber: gedeckelt auf ~250 business-initiierte Gespräche / 24 h | — |

Für den Start einer Nischen-App reichen ~250 Konversationen/Tag locker.
**Verifizierung erst angehen, wenn das Volumen es verlangt.** Sauberer Schweizer
Weg dafür: ein **Einzelunternehmen** (kostenlos gründbar, kein Kapital nötig)
liefert die Dokumente (Handelsregister-/Steuerauszug), die Meta akzeptiert.

## Launch-Checkliste

1. **Echte Absendernummer hinzufügen** (statt Testnummer): Meta-Dashboard →
   RideBeaconV2 → WhatsApp → API Setup → „Add phone number". Eine Nummer nehmen,
   die noch KEIN WhatsApp-Konto hat. Danach entfällt die „max. 5 Test-Empfänger"-
   Grenze. Neue Phone Number ID auf Render (`WHATSAPP_PHONE_NUMBER_ID`) setzen.
2. **Template abwarten** (`ride_notification`): kommt von allein durch Metas
   Prüfung (bei neuen Accounts 24–48 h). Status prüfen:
   Dashboard → WhatsApp → Message templates. Wenn „Approved" →
   `WHATSAPP_FREETEXT=0` auf Render setzen und redeployen.
3. **Permanenten Token erstellen** (geht ohne Verifizierung!):
   - Voraussetzung: **2FA auf dem Facebook-Konto aktivieren** — das ist meist
     der Grund, warum die System-Users-Seite „having trouble completing your
     request" zeigt.
   - business.facebook.com/settings → System users → Add → Rolle Admin →
     Generate token → App RideBeaconV2 → Ablauf „Never" → Rechte
     `whatsapp_business_messaging` + `whatsapp_business_management` → Token
     kopieren → auf Render als `WHATSAPP_ACCESS_TOKEN` setzen.
   - Der aktuelle Token ist ein temporärer API-Setup-Token (~1 h gültig) und
     läuft ständig ab — für Produktion zwingend ersetzen.
4. **Optional später — Business-Verifizierung** nur bei Wachstum
   (siehe Abschnitt oben).

## Token / Env auf Render setzen (per API)

```bash
source backend/.env   # RENDER_API_KEY, SRV-ID stehen dort
SRV=srv-d92ilbi8qa3s73dfvm9g
# Token aktualisieren:
curl -X PUT -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  -d '{"value":"<NEUER_TOKEN>"}' \
  "https://api.render.com/v1/services/$SRV/env-vars/WHATSAPP_ACCESS_TOKEN"
# Auf Template-Modus umschalten:
curl -X PUT -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  -d '{"value":"0"}' \
  "https://api.render.com/v1/services/$SRV/env-vars/WHATSAPP_FREETEXT"
# Deploy triggern:
curl -X POST -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  -d '{}' "https://api.render.com/v1/services/$SRV/deploys"
```

## End-to-end testen

```bash
BASE=https://ridebeacon-backend-kknw.onrender.com
curl -X POST $BASE/api/device/register -H 'Content-Type: application/json' -d '{"deviceId":"wa-test"}'
curl -X POST $BASE/setup/wa-test/whatsapp -d 'phone=%2B41794041881&consent=on'
curl -X POST $BASE/api/device/send -H 'Content-Type: application/json' \
  -d '{"deviceId":"wa-test","message":"Testfahrt gestartet"}'
```

Im Freitext-Modus vorher der Absendernummer eine WhatsApp schicken (öffnet das
24h-Fenster). Im Template-Modus nicht nötig.

## Troubleshooting

- **„(#131047) Re-engagement message" / außerhalb 24h-Fenster**: Freitext geht
  nicht mehr → Template-Modus nutzen (`WHATSAPP_FREETEXT=0`, Template approved).
- **„Session has expired"**: Token abgelaufen (temporärer Token ~1 h) → neuen
  holen, besser permanenten System-User-Token (Checkliste Punkt 3).
- **Template bleibt lange PENDING**: bei neuen Accounts normal (24–48 h). Nicht
  mehrfach fast identische Templates einreichen — erhöht das Ablehnungsrisiko.
- **Empfänger bekommt nichts, aber API sagt OK**: Testnummer erlaubt nur die
  max. 5 im Dashboard eingetragenen Empfänger → echte Nummer verwenden
  (Checkliste Punkt 1).
