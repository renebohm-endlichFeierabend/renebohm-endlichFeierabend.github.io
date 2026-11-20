# Website auf dem eigenen Server (Hetzner)

Stand: 2026-11-07. Die Website läuft unter `https://endlich-feierabend-ki.de` (www leitet dorthin um) auf demselben Server
wie der Lerncoach (`coach.endlich-feierabend-ki.de`). GitHub bleibt Ablage für den Code. Bis die Domain auf den Server
zeigt, läuft parallel weiter GitHub Pages.

## Aufbau

| Was | Wo |
|---|---|
| Code (Klon dieses Repos, root) | `/opt/website` |
| Statische Seite (gebaut) | `/srv/website/current` → `releases/<zeit>-<commit>`, die letzten drei bleiben |
| Backend `server/websiteapi.py` | Dienst `website-api`, nur `127.0.0.1:8100`, Caddy leitet `/api/` dorthin |
| Python-Umgebung | `/opt/website-venv` |
| Einstellungen, SMTP-Zugang | `/etc/website/website.env` (640, nie ins Repo); Vorlage `deploy/website.env.vorlage` |
| Datenbank (SQLite) | `/var/lib/website` (Benutzer `website`, 700) |
| Sicherungen | `/var/backups/website`, jede Nacht 03:27, die letzten 14 |
| Caddy | `/etc/caddy/sites/website.caddy`, eingebunden per `import` in `/etc/caddy/Caddyfile` |

## Trennung vom Lerncoach

Auf dem Server liegen Daten von Kindern (Lerncoach). Die Website ist öffentlich und nimmt Eingaben an. Deshalb:

- eigener Systembenutzer `website` für das Backend, eigener Benutzer `website-build` nur zum Bauen;
- das Backend läuft in einer systemd-Sandbox (`website-api.service`): Dateisystem nur lesbar außer `/var/lib/website`,
  Lerncoach-Pfade (`/var/lib/lerncoach`, `/etc/lerncoach`, `/opt/lerncoach`, Sicherungen) unsichtbar, keine Rechte,
  Speicher begrenzt;
- `npm ci` (führt fremden Paketcode aus) läuft in einer eigenen Sandbox ohne Zugriff auf Lerncoach- und Website-Daten;
- getrennte Datenbanken, getrennte Schlüssel, getrennte Sicherungen.

Grenze: Beide laufen auf demselben Betriebssystem. Eine Lücke im Kernel oder in Caddy beträfe beide.

## Einrichten

```bash
bash /opt/website/server/deploy/setup.sh endlich-feierabend-ki.de        # klont das Repo, falls es fehlt
nano /etc/website/website.env    # SMTP_USER, SMTP_PASSWORD, MAIL_FROM (Postfach bei Strato)
systemctl restart website-api
/opt/website/server/deploy/web.sh testmail du@example.de
```

Ohne SMTP-Zugang nimmt das Backend keine Anmeldungen an, statt Adressen ohne Bestätigung zu sammeln.

Das `setup.sh` des Lerncoach schreibt `/etc/caddy/Caddyfile` neu und entfernt dabei die `import`-Zeile. Danach
`bash /opt/website/server/deploy/caddy-einbinden.sh endlich-feierabend-ki.de` aufrufen (macht `update.sh` auch).

## Alltag

```bash
/opt/website/server/deploy/update.sh       # sichern, git pull, bauen, Backend neu starten
/opt/website/server/deploy/web.sh zaehlen
/opt/website/server/deploy/web.sh export warteliste > warteliste.csv   # bestätigte Adressen mit Abmeldelink
/opt/website/server/deploy/web.sh loeschen adresse@example.de
journalctl -u website-api -n 50
```

## Anmeldung (Double-Opt-in)

Formular → `POST /api/anmelden` (Felder `email`, `liste`, `einwilligung=ja`, Honeypot `website`) → Mail mit Link →
Bestätigen per Knopf (`POST`, damit Link-Scanner nichts auslösen) → eingetragen. Unbestätigtes wird nach 72 h gelöscht.
Abmelden löscht den Eintrag vollständig. Gespeichert werden Adresse, Liste, Zeitpunkte und Wortlaut der Einwilligung,
**keine IP-Adressen**; der Dienst schreibt kein Zugriffsprotokoll. Neue Listen: `LISTEN` in `websiteapi.py`.

Test: `python -m pytest server/` (braucht `fastapi`, `python-multipart`, `httpx`, `pytest`).

## Kursshop (Kauf → Einschreibung im Moodle)

Stand 2026-11-20, Branch `kursshop`, **noch nicht ausgerollt, noch kein echter Stripe-Test**. Entscheidung bohm (20.11.):
Zahlung über **Stripe direkt** (Checkout, Billing, Kundenportal), nicht Digistore24.
Code: `server/kursshop.py` (in `create_app()` eingebunden), Zuordnung und Preise: `server/kursshop.json`, Tests:
`server/test_kursshop.py`. Keine neuen Pakete: Stripe und Moodle werden mit `urllib` aus der Standardbibliothek
angesprochen (je ein Formular-POST, dafür lohnt kein SDK).

`[U]` = ungeprüft, keine Rechtsberatung. Vor dem Live-Gang von einer fachkundigen Stelle prüfen lassen.

### Ablauf und Endpunkte

| Was | Wo |
|---|---|
| Kursliste (statisch) | `/kurse/` (`kurse/index.html`): Einstiegskurs „kostenlos starten“ (Moodle-Link), Bezahlkurse mit Kaufknopf |
| Bestellseite | `GET /api/kauf/bestellen?produkt=…`: Preis, zwei Pflicht-Häkchen, Knopf „Zahlungspflichtig bestellen“ |
| Weiter zu Stripe | `POST /api/kauf/bestellen`: prüft den Stripe-Preis gegen `kursshop.json`, legt die Bestellung `offen` an (Zeitpunkt und Wortlaut der Zustimmung, noch **ohne** Mailadresse), 303 zu Stripe Checkout |
| Erfolg / Abbruch | `/kurse/danke.html`, `/kurse/abbruch.html` (statisch) |
| Webhook | `POST /api/kauf/stripe` |
| Kündigung (§ 312k BGB) | Link „Verträge hier kündigen“ im Fuß jeder Seite → `/vertraege-kuendigen.html` (Formular, Knopf „Jetzt kündigen“) → `POST /api/kuendigen` → Bestätigungsseite (druckbar, mit Datum/Uhrzeit) und Eingangsbestätigung per Mail |
| Zustand | `GET /api/health` zeigt `kursshop: {aktiv, stripe, webhook, moodle}` (nur ja/nein) |

Webhook-Ereignisse (Signatur: Header `Stripe-Signature`, HMAC-SHA256 über `t.payload`, 5 Minuten Toleranz,
mehrere `v1` erlaubt; jede Event-ID wird gespeichert und nur einmal erfolgreich verarbeitet, zusätzlich prüft jede
Bestellung ihren Status):

| Ereignis | Wirkung |
|---|---|
| `checkout.session.completed`, `checkout.session.async_payment_succeeded` | bezahlt → Moodle-Konto per E-Mail suchen, sonst anlegen; Einzelkurs: `enrol_manual_enrol_users` (roleid 5); Abo: Kohorte `abo-alle-kurse`; Bestätigungsmail. Unbezahlt (z. B. Lastschrift) → `zahlung_ausstehend` |
| `invoice.paid` | Abo verlängert → Kohorte sicherstellen, `bezahlt_bis` merken (erste Rechnung: Freischaltung macht der Checkout) |
| `customer.subscription.updated` | `canceled`/`unpaid`/`incomplete_expired` → aus Kohorte entfernen; `cancel_at_period_end` → Status `gekuendigt` (Zugang bis Periodenende) |
| `customer.subscription.deleted` | aus Kohorte entfernen (`core_cohort_delete_cohort_members`) |
| `charge.refunded` (vollständig), `charge.dispute.created` | Einzelkurs: mit `KURSSHOP_AUSTRAGEN=1` austragen, sonst (Standard, weil `enrol_manual_unenrol_users` nicht freigegeben) Mail an bohm mit Benutzer, Kurs und Link. Abo: aus Kohorte entfernen + Mail (Abo in Stripe ggf. kündigen). Teilerstattung: nur Mail |

Antworten an Stripe: 200 (erledigt oder „Klärung nötig“, dann Mail an `KURSSHOP_ADMIN_MAIL`), 503 bei vorübergehenden
Fehlern (Moodle/Stripe nicht erreichbar, SMTP fehlt) → Stripe wiederholt bis zu 3 Tage. Nach einer Klärung:
`web.sh kauf-nachholen EF-…`.

**Moodle-Konten (Stand: Moodle verschickt keine Mails).** Neue Konten bekommen ein zufälliges Startpasswort
(16 Zeichen, erfüllt die Standard-Passwortregeln) mit `createpassword=0` und der Präferenz
`auth_forcepasswordchange=1` (in `core_user_create_users` → `preferences`, keine weitere Funktion nötig). Das
Passwort steht nur in der Bestätigungsmail der Website (mit Benutzername und Login-Link), nie im Log, nie in der
Datenbank (der Test prüft das). Benutzername = E-Mail-Adresse (unerlaubte Zeichen ersetzt). Vorhandene Konten
bekommen nur den Login-Link. Später, wenn Moodle Mails verschickt: `MOODLE_CREATEPASSWORD=1`. Der Link „Passwort
vergessen“ geht derzeit nicht (läuft über Moodle-Mail), deshalb steht in der Mail „antworte auf diese Mail“.
Name fürs Konto: Rechnungsname aus Stripe. Die Mail weist auf den Community-Bereich der Moodle-Startseite hin.

### Was root in `/etc/website/website.env` eintragen muss

Die Vorlage `deploy/website.env.vorlage` enthält alle neuen Zeilen; eine bestehende `.env` wird **nicht**
überschrieben, die Zeilen also von Hand ergänzen:

| Variable | Wert |
|---|---|
| `STRIPE_SECRET_KEY` | zuerst der **Test**-Schlüssel `sk_test_…` (besser: eingeschränkter Schlüssel `rk_test_…` mit Schreibrecht auf Checkout Sessions und Subscriptions, Leserecht auf Prices und Charges) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` des Webhook-Endpunkts (von bohm aus dem Dashboard) |
| `STRIPE_PRICE_BEISPIEL_BEZAHLT`, `STRIPE_PRICE_ABO_ALLE_KURSE` | Preis-IDs `price_…` |
| `MOODLE_KURSSHOP_TOKEN` | aus `/var/lib/moodle-kursbau/.kursshop-token` |
| `MOODLE_ABO_KOHORTE_ID` | numerische ID der Kohorte `abo-alle-kurse` (zum Entfernen nötig, `core_cohort_delete_cohort_members` will die ID) |
| `KURSSHOP_ADMIN_MAIL` | Adresse von bohm für Meldungen |
| `KURSSHOP_AKTIV` | `1` erst, wenn `web.sh kauf-pruefen` ohne Fehler durchläuft |
| optional | `STRIPE_PORTAL_LOGIN_URL`, `MOODLE_CREATEPASSWORD=0`, `KURSSHOP_AUSTRAGEN=0` |

Danach `update.sh` (baut `kurse/` mit, schreibt die Caddy-Datei neu: `/api/kauf/stripe` darf bis 1 MB groß sein,
der Rest von `/api/` bleibt bei 16 KB) und `web.sh kauf-pruefen` (zeigt Testmodus/Live, Moodle-Funktionen, ob die
Stripe-Preise zu `kursshop.json` passen und ob die Kohorten-ID fehlt; ändert nichts).

### Was bohm im Stripe-Dashboard einrichtet (zuerst im Testmodus)

1. Produkte und Preise anlegen: Einzelkurs als einmaliger Preis, Abo als monatlich wiederkehrender Preis, Währung
   EUR, Betrag wie in `kursshop.json` (sonst lehnt die Bestellseite ab). Preis-IDs an root.
2. Webhook: Entwickler → Webhooks → Endpunkt hinzufügen, URL
   `https://endlich-feierabend-ki.de/api/kauf/stripe`, Ereignisse: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`. API-Version: Standard des Kontos
   (der Code liest alte und neue Form der Rechnungs-/Abo-Felder). Signaturschlüssel `whsec_…` an root.
3. Rechnungen: Einstellungen → Billing → Rechnungsvorlage: Standard-Fußzeile
   „Nach § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.“ (für **Abo**-Rechnungen; beim Einzelkauf setzt der
   Code die Fußzeile selbst über `invoice_creation`). Firmenname, Anschrift, Rechnungsnummern-Präfix eintragen.
   Belege/Rechnungen per Mail an Kundschaft: Einstellungen → Kunden-E-Mails „Erfolgreiche Zahlungen“ einschalten.
4. Kundenportal (Einstellungen → Billing → Kundenportal) aktivieren: Zahlungsmethode ändern, Rechnungen ansehen,
   Kündigung zum Periodenende. Den Login-Link (`https://billing.stripe.com/p/login/…`) an root
   (`STRIPE_PORTAL_LOGIN_URL`). Das Portal ersetzt die Kündigungsseite **nicht** (siehe [U] unten).
5. Zahlungsmethoden: Karte reicht zum Start. Lastschrift/SEPA geht auch (Freischaltung erst bei
   `async_payment_succeeded`, kann Tage dauern).
6. Erst nach erfolgreichem Test: dasselbe im Live-Modus, Live-Schlüssel an root.

### Testen (Testmodus, ohne echtes Geld)

- Lokal ohne Stripe: `python -m pytest server/` (Stripe und Moodle nachgestellt; 23 Tests: Bestellseite,
  Signatur, Idempotenz, alle Ereignisarten, Erstattung mit/ohne Schalter, Abo-Ablauf, Kündigung, HTTP-Schicht,
  Abgleich `kurse/index.html` ↔ `kursshop.json`).
- Mit Stripe-Testmodus: auf `/kurse/` kaufen, Testkarte `4242 4242 4242 4242`, beliebiges künftiges Datum,
  beliebige Prüfziffer; Rechnungsadresse in Deutschland. Erwartet: Mail mit Zugangsdaten, Konto und Einschreibung
  im Moodle (Kurs 31 bzw. Kohorte). Abgelehnte Karte: `4000 0000 0000 0002`.
- Ereignisse einzeln (Stripe CLI): `stripe listen --forward-to https://endlich-feierabend-ki.de/api/kauf/stripe`
  (oder im Dashboard „Testereignis senden“), dann z. B. `stripe trigger customer.subscription.deleted`,
  `stripe trigger charge.refunded`, `stripe trigger charge.dispute.created`. Achtung: `stripe trigger` erzeugt
  eigene Objekte ohne unsere `bestellnr`; der Webhook antwortet dann mit „ignoriert“. Das prüft Signatur und
  Erreichbarkeit. Für die echte Wirkung erst über `/kurse/` ein Testabo kaufen und es dann im Dashboard kündigen
  bzw. die Testzahlung erstatten.
- Mit `stripe listen` ist das Signaturgeheimnis das der CLI-Sitzung (`whsec_…` aus der Ausgabe), nicht das des
  Dashboard-Endpunkts.
- Moodle: nach dem ersten Testkauf prüfen, ob beim ersten Login ein Passwortwechsel verlangt wird
  (`auth_forcepasswordchange`) [ungeprüft gegen unser Moodle]. Testkonten danach löschen.
- Verwaltung: `web.sh kauf-liste`, `web.sh kauf-kuendigungen`, `journalctl -u website-api`.

### [U] Rechtliches, Länder, Belege (ungeprüft, keine Rechtsberatung)

- **Widerrufsrecht (§ 356 Abs. 5 BGB):** Pflicht-Häkchen auf unserer Bestellseite vor der Weiterleitung, Wortlaut
  in `kursshop.py` (`WIDERRUF_TEXT`, Version `WIDERRUF_VERSION`). Zeitpunkt in DB (`widerruf_zustimmung_am`) und
  Stripe-Metadaten; Wortlaut und Zeitpunkt stehen in der Bestätigungsmail (als Bestätigung nach § 312f BGB gedacht).
  Für das Abo ebenso.
- **Button-Lösung (§ 312j Abs. 3 BGB):** Unser Knopf heißt „Zahlungspflichtig bestellen“. Bei Stripe heißt der
  letzte Knopf „Bezahlen“ bzw. „Abonnieren“ (nicht änderbar); daneben steht per `custom_text` der Hinweis, dass
  damit zahlungspflichtig bestellt wird. Ob dieser zweistufige Ablauf genügt, ist ungeprüft.
- **Kündigungsbutton (§ 312k BGB):** „Verträge hier kündigen“ im Fuß jeder Seite (nicht in `video-upgrade.html`,
  die hat keinen Fuß), Bestätigungsseite mit Name, E-Mail, Vertrag, Bestellnummer, Art (ordentlich/außerordentlich),
  Grund, Zeitpunkt, Knopf „Jetzt kündigen“, danach druckbare Seite mit Datum/Uhrzeit und sofortige
  Eingangsbestätigung per Mail. Ordentlich zum nächstmöglichen Zeitpunkt wird automatisch in Stripe umgesetzt
  (`cancel_at_period_end`); außerordentlich, mit Datum oder ohne passenden Vertrag: Mail an bohm, Bearbeitung von
  Hand. Ohne Login: Wer eine fremde Adresse eingibt, kündigt deren Abo zum Periodenende; die Bestätigung geht aber
  an genau diese Adresse, und die Kündigung lässt sich im Dashboard zurücknehmen. Das Stripe-Kundenportal allein
  genügt vermutlich nicht.
- **Nur Kundschaft in Deutschland:** Stripe Checkout kann das Rechnungsland **nicht** beschränken (eine Länderliste
  gibt es nur für Lieferadressen). Umgesetzt: Pflicht-Häkchen „Wohnsitz in Deutschland, Privatperson“,
  Rechnungsadresse ist Pflicht, und der Webhook meldet bohm jeden Kauf mit Rechnungsland ≠ DE (freigeschaltet wird
  trotzdem; bohm entscheidet über Erstattung). Härter ginge es nur mit Radar-Regeln (z. B. Kartenland ≠ DE
  blockieren; je nach Stripe-Tarif kostenpflichtig, ungeprüft). Hintergrund: Kleinunternehmer; bei Verkäufen an
  Privatleute in anderen EU-Ländern greift die Lieferschwelle (10.000 € EU-weit), dazu Steuerberatung fragen.
- **Belege:** Einzelkauf: Stripe-Rechnung mit Fußzeile „Nach § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.“
  (`invoice_creation`). Abo-Rechnungen: Fußzeile im Dashboard (Aufgabe bohm, s. o.). Pflichtangaben einer Rechnung
  (Name/Anschrift, Steuernummer, fortlaufende Nummer) im Stripe-Konto hinterlegen, ungeprüft. Stripe-Gebühren und
  Buchhaltung: siehe `UEBERGABE-POSTFACH-BUCHHALTUNG.md`.
- **Rechtstexte müssen angepasst werden (bohm):** Die AGB in `impressum.html` nennen noch Digistore24, „inklusive
  Mehrwertsteuer“ und den Knopf „Jetzt kaufen“; die Widerrufsbelehrung spricht von „Download“. Datenschutzerklärung:
  Abschnitte Stripe (Zahlung, Drittland USA), Moodle (Konto, Einschreibung) und Kursshop-Daten fehlen.
  Nebentätigkeit Teil B (Verkauf) muss genehmigt sein, bevor `KURSSHOP_AKTIV=1` im Live-Modus.

### Gespeicherte Daten

`kauf_bestellungen`: Bestellnummer, Produkt, Status, Zustimmung (Zeit, Version, Wortlaut), nach der Zahlung
E-Mail, Rechnungsland, Betrag, Stripe-IDs, Moodle-Benutzer-ID und -name; **kein** Name, **kein** Passwort, keine
IP-Adressen. Offene (nie bezahlte) Bestellungen werden nach 7 Tagen gelöscht. `kauf_ereignisse`: Event-ID, Typ,
Ergebnis (nach 90 Tagen gelöscht). `kauf_kuendigungen`: die Kündigungserklärung (Nachweis). Aufbewahrungsfristen
dafür festlegen (offen).

### Offen

- Preise und Kursliste (bohm): `kursshop.json` und `kurse/index.html` enthalten Platzhalter (Beispielkurs 29 €,
  Abo 4,99 €/Monat). Bei Änderung beide Dateien anpassen; der Test vergleicht sie.
- „Kostenlos starten“ (Kurs 30) führt ins Moodle; Kurs 30 ist noch verborgen, und ohne Selbstregistrierung (braucht
  Moodle-Mailversand) können Neue sich dort nicht anmelden.
- Moodle-Mailversand: bis dahin Startpasswort in unserer Mail, „Passwort vergessen“ geht nicht.
- `enrol_manual_unenrol_users` freigeben (root), dann `KURSSHOP_AUSTRAGEN=1`.
- Kohorten-ID `abo-alle-kurse` an root (`MOODLE_ABO_KOHORTE_ID`).
- Ungeprüft gegen das echte Moodle: `preferences`/`auth_forcepasswordchange` beim Anlegen, Verhalten von
  `core_cohort_add_cohort_members` bei schon vorhandenem Mitglied (Code erwartet: nur Warnung).
- Schullizenzen / B2B: nicht gebaut.

## Offen

- Datenschutzerklärung (`impressum.html`): Abschnitte Hosting und Warteliste sind ein Entwurf, rechtlich prüfen.
- AV-Verträge mit Hetzner und Strato.
- Die beiden Formulare in `ki-kickstart.html` gehören zum Kauf über Digistore24 und sind nicht angebunden.
- Kursshop: siehe Abschnitt „Kursshop“ oben.
- Instagram-Routine (Repo KI-Fortbildung) holt Medien aus `assets/social/` über die GitHub-Pages-Adresse; beim
  Abschalten von Pages auf die neue Domain umstellen.
- Versand eines Newsletters an die Liste: noch nicht gebaut (Export als CSV ist vorhanden).
