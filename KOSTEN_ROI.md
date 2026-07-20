# Kosten & ROI — RideBeacon V2

Stand: 20.07.2026. Break-even- und Nettoerlös-Modell für den Multi-Channel-
Betrieb (SMS via AWS SNS, Telegram, WhatsApp via Meta). Interaktive Version
zum Durchspielen: **https://claude.ai/code/artifact/383d7492-959a-44e0-a4eb-6a7215224c65**

## Modell

Pro Kunde und Monat:

```
Netto-Umsatz     = (Jahrespreis − Stripe-Gebühr) / 12
Stripe-Gebühr    = Jahrespreis × 2,9 % + $0.30   (pro Jahrescharge)
Nachrichten      = Fahrten/Monat × 2             (Start + Stopp)
Kosten/Kunde     = Σ (Kanalanteil × Nachrichten × Kanalrate)
Deckungsbeitrag  = Netto-Umsatz − Kosten/Kunde
```

Aggregiert:

```
Break-even (Kunden) = ceil(Fixkosten / Deckungsbeitrag)     (nur wenn DB > 0)
Nettoerlös/Monat    = Kunden × Deckungsbeitrag − Fixkosten
Nettoerlös/Jahr     = Nettoerlös/Monat × 12
```

Kanalgewichte sind relativ und werden auf die **aktiven** Kanäle normiert
(ein abgeschalteter Kanal → sein Anteil verteilt sich auf die übrigen).

## Kostenquellen

| Quelle | Art | Wert |
|---|---|---|
| WhatsApp (Meta) | variabel | Utility-Rate je Markt, z. B. CH/Westeuropa **$0.0171**/Nachricht |
| SMS (AWS SNS) | variabel | ~**$0.07**/Nachricht in die Schweiz (Sandbox-Limit $1/Mt. vor Launch aufheben) |
| Telegram | variabel | **$0** (offizielle Bot-API, unbegrenzt) |
| Stripe | pro Transaktion | 2,9 % + $0.30 pro Jahrescharge |
| Render (Web + Postgres) | fix | ~**$14/Monat** |
| AWS SNS Grundgebühr | fix | keine |

WhatsApp-Raten je Markt (Utility / SMS), wie im Rechner hinterlegt:

| Markt | WhatsApp | SMS |
|---|---|---|
| Schweiz / Westeuropa | $0.0171 | $0.07 |
| Deutschland | $0.055 | $0.08 |
| Nordamerika | $0.0034 | $0.006 |
| Global gemischt | $0.02 | $0.05 |

## Basis-Szenario

Annahmen: Preis **24 USD/Jahr**, **12 Fahrten/Monat** (= 24 Nachrichten),
Markt Schweiz/Westeuropa, Fixkosten $14/Monat, Kanalmix **60 % WhatsApp /
20 % SMS / 20 % Telegram**.

| Kennzahl | Wert |
|---|---|
| Netto-Umsatz / Kunde·Monat | $1.92 |
| Nachrichtenkosten / Kunde | $0.58 |
| Deckungsbeitrag / Kunde | **$1.34** |
| **Break-even** | **~11 Kunden** |
| Nettoerlös bei 100 Kunden | ~$120/Monat (~$1'434/Jahr) |
| Nettoerlös bei 250 Kunden | ~$340/Monat |
| Nettoerlös bei 1'000 Kunden | ~$1'400/Monat |

## Deckungsbeitrag je Kanal (Basis-Annahmen)

| Kanal | Kosten/Kunde·Mt. | Deckungsbeitrag/Kunde·Mt. |
|---|---|---|
| Telegram | $0 | +$1.92 |
| WhatsApp | $0.41 | +$1.51 |
| SMS | $1.68 | +$0.24 |

## Erkenntnisse

1. **SMS ist der Margenkiller** — bei 12 Fahrten/Monat bringt ein reiner
   SMS-Kunde nur ~$0.24/Monat; bei häufigerer Nutzung (z. B. 30 Fahrten)
   wird er defizitär. WhatsApp ist bei gleicher Nachrichtenzahl ~40×
   günstiger. SMS eher als Fallback, nicht bewerben.
2. **Telegram ist reiner Gewinn** ($1.92/Kunde). Jeder von SMS zu
   Telegram/WhatsApp gelenkte Nutzer verbessert die Marge.
3. **Der Jahrespreis hilft dem Cashflow** — $24 im Voraus, aber nur ~$5/Jahr
   Nachrichtenkosten pro WhatsApp-Kunde. Fixkosten ab ~11 Kunden gedeckt.
4. **WhatsApp-250/Tag-Limit** (unverifiziert) beißt erst spät: bei 12
   Fahrten/Monat erreicht man 250 eindeutige Empfänger/24 h erst bei grob
   600+ WhatsApp-Kunden — dann rechtfertigt der Gewinn Einzelfirma +
   Verifizierung (siehe [WHATSAPP_MIT_META.md](WHATSAPP_MIT_META.md)).

## Grenzen des Modells

- Rein operative Sicht (keine einmaligen Entwicklungskosten, kein Marketing).
- Konstanter Deckungsbeitrag pro Kunde; Mengenrabatte/Preisstufen bei WhatsApp
  über höhere Tiers sind nicht abgebildet.
- Trial-Phase (7 Tage gratis) verursacht Nachrichtenkosten ohne Umsatz —
  bei kurzer Trial-Dauer vernachlässigbar, bei hoher Trial-Abbruchquote nicht.
