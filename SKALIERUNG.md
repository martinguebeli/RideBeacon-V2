# Skalierung — RideBeacon V2

Stand: 20.07.2026. Kapazitäts-Einschätzung des Backends und dokumentierter
Scale-Up-Pfad. Grundlage: die reale Render-Konfiguration + die Skalierungs-
Engpässe im Code.

## Aktuelle Konfiguration

| Komponente | Plan | Ressourcen |
|---|---|---|
| Web (Node/Express) | Render **Starter**, 1 Instanz, kein Autoscaling | ~0.5 CPU, 512 MB RAM |
| Postgres | **basic_256mb** | 256 MB RAM, ~1 GB Storage, ~97 Verbindungen |
| Region | Oregon | — |

Service-ID `srv-d92ilbi8qa3s73dfvm9g`, verwaltbar per Render-API
(`RENDER_API_KEY` in `backend/.env`).

## Analyse pro Dimension

**Datenmenge — unkritisch.** 100k Zeilen in `devices` sind für Postgres
trivial; alle Abfragen laufen über den Primary Key (`getDevice`,
`getDeviceBySubscriptionId`). 256 MB RAM reichen dafür locker, Storage < 1 GB.

**Nachrichtendurchsatz — im Schnitt ok, bei Spitzen eng.**
Rechnung bei 100k Nutzern × 12 Fahrten/Monat × 2 Nachrichten:
- ~2.4 Mio Nachrichten/Monat ≈ 80k/Tag ≈ **~1/Sekunde im Mittel**
- Radfahren ballt sich (Morgen/Abend, Wochenende) → Peaks von mehreren hundert
  gleichzeitigen Sends/Sekunde möglich. Dann wird 0.5 CPU zum Flaschenhals.
- `POST /api/device/send` ([routes/notify.js](backend/src/routes/notify.js))
  sendet **synchron** und hat keine Retry-Queue → bei Bursts oder Provider-
  Timeouts gehen Nachrichten verloren (500 an die App).

**Gleichzeitige Verbindungen — der eigentliche Engpass.**
Der Long-Poll `GET /api/device/status/:id/wait`
([services/realtime.js](backend/src/services/realtime.js)) hält pro wartendem
Gerät eine offene HTTP-Verbindung (LISTEN/NOTIFY, EventEmitter,
`maxListeners=0`).
- **Wichtig:** laut Design nur beim **Onboarding** genutzt (QR-Anzeige,
  Telegram-Opt-in, Zahlung abwarten) — NICHT im Dauerbetrieb. Steady-State-
  Senden ist ausgehend und kurzlebig.
- Es sind also nie 100k Verbindungen gleichzeitig offen, sondern nur die
  Nutzer, die *gerade* onboarden (verteilt über die Zeit, Einmal-Event pro
  Nutzer). Das trägt eine Starter-Instanz.
- **Regression-Wächter:** Würde die Karoo-App dauerhaft einen Long-Poll
  offenhalten, bräche das Modell bei hoher Nutzerzahl. Long-Poll muss
  onboarding-only bleiben.

## Der erste Engpass ist NICHT die HW

- **Nachrichten-Provider** binden zuerst: WhatsApp-Limit (250/Tag
  unverifiziert → skaliert mit Business-Verifizierung), AWS-SNS-Spend-Limit
  (Default $1/Monat, Sandbox). Siehe [WHATSAPP_MIT_META.md](WHATSAPP_MIT_META.md)
  und [SMS_MIT_AWSSNS.md](SMS_MIT_AWSSNS.md).
- **Single Point of Failure**: 1 Instanz, kein Autoscaling, kein DB-Replica —
  schon ab ~1'000 zahlenden Kunden ein Reliability-Thema, unabhängig von 100k.

## Scale-Up-Pfad (Schwellen)

| Ab ca. | Schritt | Warum |
|---|---|---|
| **0–1'000 Kunden** | Aktuelle HW belassen | Reicht für Durchsatz und Onboarding-Last |
| **~1'000** | Web auf 2 Instanzen (Redundanz), Health-Checks | SPOF entschärfen, Deploys ohne Downtime |
| **~1'000** | AWS SNS aus Sandbox, Spend-Limit hoch | Sonst SMS-Stopp |
| **~5'000–10'000** | Web auf **Standard**-Plan + Autoscaling; Postgres-Plan mit mehr RAM/Verbindungen | CPU-Peaks + Verbindungspool |
| **~10'000** | **Sende-Queue** mit Retry (BullMQ/Redis o. Ä.) statt synchronem Send | Bursts abfedern, keine verlorenen Nachrichten |
| **~10'000** | WhatsApp Business-Verifizierung (Tier > 250/Tag) | Provider-Limit |
| **~50'000+** | Postgres **Read-Replica**, Verbindungs-Pooling (PgBouncer), Metriken/Alerting | Leselast + Sichtbarkeit |
| **100'000** | 2–3 Web-Instanzen hinter LB, Queue, Replica, Monitoring | Vollausbau |

## Wichtige Nebenbedingungen beim Skalieren

- **DB-Verbindungslimit**: Pool-Größe × Anzahl Web-Instanzen muss unter dem
  Postgres-Verbindungslimit bleiben (basic_256mb ≈ 97). Bei mehreren Instanzen
  Pool klein halten oder PgBouncer davorsetzen.
- **LISTEN/NOTIFY bei mehreren Instanzen**: Jede Web-Instanz hält ihre eigene
  LISTEN-Verbindung (`realtime.js` reconnectet automatisch). Das funktioniert
  mit mehreren Instanzen, kostet aber je Instanz eine DB-Verbindung.
- **Stripe-Webhook** ist idempotent genug für mehrere Instanzen (schreibt per
  deviceId), kein Sonderfall.

## Kostenrahmen

Vollausbau für 100k grob **$50–150/Monat** (Standard-Web + größere DB +
Redis-Queue). Zur Einordnung: Der ROI-Rechner ([KOSTEN_ROI.md](KOSTEN_ROI.md))
zeigt bei 100k Kunden fünf- bis sechsstelligen Monatsgewinn — die
Infrastruktur ist dann Rundungsfehler.

**Fazit:** Für Launch und die ersten Tausend Kunden ist die aktuelle HW
ausreichend. 100k stemmt sie nicht, aber der Weg dahin ist ein bekannter,
günstiger, schrittweiser Scale-Up — und die Provider-Limits kommen ohnehin
zuerst. Kein Grund, jetzt zu über-engineeren.
