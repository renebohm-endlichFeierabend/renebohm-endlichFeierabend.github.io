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

Test: `python server/test_websiteapi.py` (braucht `fastapi`, `python-multipart`, `httpx`).

## Offen

- Datenschutzerklärung (`impressum.html`): Abschnitte Hosting und Warteliste sind ein Entwurf, rechtlich prüfen.
- AV-Verträge mit Hetzner und Strato.
- Die beiden Formulare in `ki-kickstart.html` gehören zum Kauf über Digistore24 und sind nicht angebunden.
- Instagram-Routine (Repo KI-Fortbildung) holt Medien aus `assets/social/` über die GitHub-Pages-Adresse; beim
  Abschalten von Pages auf die neue Domain umstellen.
- Versand eines Newsletters an die Liste: noch nicht gebaut (Export als CSV ist vorhanden).
