"""Kleines Backend für die Website: Anmeldung zu Listen (Warteliste, später Newsletter) mit Double-Opt-in.

Läuft auf dem Server als Dienst website-api (Benutzer `website`) hinter Caddy unter /api/.
Bewusst klein gehalten: SQLite, keine Sitzungen, keine Cookies, keine IP-Adressen in der Datenbank.

Ablauf
  1. POST /api/anmelden          Formular (email, liste, einwilligung=ja). Legt einen offenen Eintrag an und
                                 schickt die Bestätigungsmail.
  2. GET/POST /api/bestaetigen   Link aus der Mail. GET zeigt nur einen Knopf, erst POST bestätigt. So lösen
                                 Link-Scanner von Mailprogrammen keine Bestätigung aus.
  3. GET/POST /api/abmelden      Link in jeder Mail. POST löscht den Eintrag vollständig.
  Offene Einträge, die nicht binnen 72 h bestätigt werden, werden gelöscht.

Die Links tragen ein HMAC-Token (Schlüssel WEBSITE_SECRET), es werden keine Tokens gespeichert.

Verwaltung (als Benutzer website, Umgebung aus /etc/website/website.env), siehe server/deploy/web.sh:
  python websiteapi.py zaehlen | export LISTE | loeschen EMAIL | testmail EMAIL | sichern ORDNER
"""
from __future__ import annotations

import csv
import hashlib
import hmac
import html
import logging
import os
import re
import smtplib
import sqlite3
import sys
import threading
import time
from collections import defaultdict, deque
from contextlib import closing
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse

log = logging.getLogger("websiteapi")

# Listen, für die man sich eintragen kann. Schlüssel = Feld `liste` im Formular.
LISTEN = {
    "warteliste": {
        "titel": "Warteliste Online-Kurs „Endlich Feierabend“",
        "zweck": "Du bekommst eine E-Mail, sobald der Online-Kurs „Endlich Feierabend“ startet.",
    },
}
# Wortlaut der Einwilligung; wird mit jedem Eintrag gespeichert (Nachweis). Bei Änderung Version erhöhen.
EINWILLIGUNG_VERSION = "2026-11-07"
EINWILLIGUNG_TEXT = (
    "Ich möchte per E-Mail informiert werden ({zweck}) Die Einwilligung kann ich jederzeit über den "
    "Abmeldelink in jeder E-Mail widerrufen."
)

BESTAETIGEN_FRIST_S = 72 * 3600
ERNEUT_SENDEN_NACH_S = 10 * 60
PRO_IP_MAX, PRO_IP_FENSTER_S = 5, 15 * 60
MAILS_PRO_STUNDE_MAX = 60
EMAIL_RE = re.compile(r"^[^@\s<>\"',;]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,63}$")


def cfg(name: str, default: str | None = None) -> str:
    wert = os.environ.get(name, default)
    if wert is None:
        raise SystemExit(f"Umgebungsvariable {name} fehlt")
    return wert


def jetzt() -> int:
    return int(time.time())


def iso(ts: int | None) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds") if ts else ""


# --------------------------------------------------------------------------- Datenbank

SCHEMA = """
CREATE TABLE IF NOT EXISTS eintraege (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL,
    liste TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('offen', 'bestaetigt')),
    angemeldet_am INTEGER NOT NULL,
    bestaetigt_am INTEGER,
    letzte_mail_am INTEGER,
    einwilligung_version TEXT NOT NULL,
    einwilligung_text TEXT NOT NULL,
    UNIQUE (email, liste)
);
"""


def db() -> sqlite3.Connection:
    con = sqlite3.connect(cfg("WEBSITE_DB", "/var/lib/website/website.db"), timeout=10, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    con.executescript(SCHEMA)
    return con


def aufraeumen(con: sqlite3.Connection) -> int:
    cur = con.execute(
        "DELETE FROM eintraege WHERE status = 'offen' AND angemeldet_am < ?", (jetzt() - BESTAETIGEN_FRIST_S,)
    )
    return cur.rowcount


# --------------------------------------------------------------------------- Tokens

def token(zweck: str, eintrag: sqlite3.Row) -> str:
    nachricht = f"{zweck}:{eintrag['id']}:{eintrag['email']}:{eintrag['liste']}:{eintrag['angemeldet_am']}"
    return hmac.new(cfg("WEBSITE_SECRET").encode(), nachricht.encode(), hashlib.sha256).hexdigest()[:40]


def link(zweck: str, eintrag: sqlite3.Row) -> str:
    return f"{cfg('SITE_URL').rstrip('/')}/api/{zweck}?id={eintrag['id']}&t={token(zweck, eintrag)}"


def eintrag_pruefen(con: sqlite3.Connection, zweck: str, id_: str, t: str) -> sqlite3.Row | None:
    if not id_.isdigit() or not re.fullmatch(r"[0-9a-f]{40}", t or ""):
        return None
    eintrag = con.execute("SELECT * FROM eintraege WHERE id = ?", (int(id_),)).fetchone()
    if eintrag is None or not hmac.compare_digest(token(zweck, eintrag), t):
        return None
    return eintrag


# --------------------------------------------------------------------------- Mail

def smtp_eingerichtet() -> bool:
    return all(os.environ.get(n) for n in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"))


def mail_senden(an: str, betreff: str, text: str, abmeldelink: str | None = None) -> None:
    msg = EmailMessage()
    msg["From"] = formataddr((cfg("MAIL_FROM_NAME", "René Bohm – Endlich Feierabend"), cfg("MAIL_FROM")))
    msg["To"] = an
    msg["Subject"] = betreff
    msg["Message-ID"] = make_msgid(domain=cfg("MAIL_FROM").split("@")[-1])
    if os.environ.get("MAIL_REPLY_TO"):
        msg["Reply-To"] = os.environ["MAIL_REPLY_TO"]
    if abmeldelink:
        msg["List-Unsubscribe"] = f"<{abmeldelink}>"
    msg.set_content(text)
    host, port = cfg("SMTP_HOST"), int(cfg("SMTP_PORT", "587"))
    if port == 465:
        smtp = smtplib.SMTP_SSL(host, port, timeout=20)
    else:
        smtp = smtplib.SMTP(host, port, timeout=20)
        smtp.starttls()
    with smtp:
        smtp.login(cfg("SMTP_USER"), cfg("SMTP_PASSWORD"))
        smtp.send_message(msg)


def bestaetigungsmail(eintrag: sqlite3.Row) -> None:
    liste = LISTEN[eintrag["liste"]]
    text = f"""Hallo,

du hast dich auf {cfg('SITE_URL')} für die {liste['titel']} eingetragen.
{liste['zweck']}

Bitte bestätige deine Anmeldung mit diesem Link (gültig 72 Stunden):
{link('bestaetigen', eintrag)}

Warst du das nicht? Dann ignoriere diese E-Mail einfach. Ohne Bestätigung wird deine Adresse nach 72 Stunden
automatisch gelöscht.

Viele Grüße
René Bohm – Endlich Feierabend
"""
    mail_senden(eintrag["email"], f"Bitte bestätigen: {liste['titel']}", text)


class Begrenzer:
    """Einfache Begrenzung im Speicher (ein Prozess): pro IP und Mails gesamt pro Stunde."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.pro_ip: dict[str, deque[float]] = defaultdict(deque)
        self.mails: deque[float] = deque()

    @staticmethod
    def _frei(q: deque[float], maximum: int, fenster: float) -> bool:
        t = time.monotonic()
        while q and q[0] < t - fenster:
            q.popleft()
        if len(q) >= maximum:
            return False
        q.append(t)
        return True

    def ip(self, ip: str) -> bool:
        with self.lock:
            if len(self.pro_ip) > 10000:
                self.pro_ip.clear()
            return self._frei(self.pro_ip[ip], PRO_IP_MAX, PRO_IP_FENSTER_S)

    def mail(self) -> bool:
        with self.lock:
            return self._frei(self.mails, MAILS_PRO_STUNDE_MAX, 3600)


# --------------------------------------------------------------------------- Web

def seite(titel: str, inhalt: str, status: int = 200):
    body = f"""<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>{html.escape(titel)} – Endlich Feierabend</title>
<link rel="icon" href="/assets/logo-mark.svg"><link rel="stylesheet" href="/assets/ef.css">
<style>.box{{max-width:560px;margin:12vh auto;padding:0 16px}}.box form{{margin-top:24px}}</style></head>
<body><main class="box"><h1>{html.escape(titel)}</h1>{inhalt}
<p style="margin-top:32px"><a href="/">Zur Startseite</a></p></main></body></html>"""
    return HTMLResponse(body, status_code=status, headers={"Cache-Control": "no-store"})


def knopf_seite(titel: str, text: str, ziel: str, id_: str, t: str, knopf: str):
    return seite(titel, f"""<p>{text}</p>
<form method="post" action="/api/{ziel}"><input type="hidden" name="id" value="{html.escape(id_)}">
<input type="hidden" name="t" value="{html.escape(t)}">
<button type="submit" class="btn btn--primary btn--lg">{html.escape(knopf)}</button></form>""")


UNGUELTIG = ("Link ungültig", "<p>Der Link ist ungültig oder abgelaufen. Falls du dich abmelden wolltest: "
             "Ein abgelaufener Eintrag ist bereits gelöscht.</p>")


def create_app():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    begrenzer = Begrenzer()
    with closing(db()) as con:
        aufraeumen(con)

    @app.get("/api/health")
    def health():
        with closing(db()) as con:
            con.execute("SELECT 1").fetchone()
        return {"status": "ok", "smtp": smtp_eingerichtet()}

    @app.post("/api/anmelden")
    def anmelden(request: Request, email: str = Form(""), liste: str = Form(""),
                 einwilligung: str = Form(""), website: str = Form("")):
        fertig = seite("Fast geschafft", "<p>Wir haben dir eine E-Mail geschickt. Bitte klicke auf den Link "
                       "darin, um deine Anmeldung zu bestätigen. Schau auch im Spam-Ordner nach.</p>")
        if website:  # Honeypot: Menschen sehen das Feld nicht
            return fertig
        email = email.strip()
        if liste not in LISTEN or einwilligung != "ja" or len(email) > 254 or not EMAIL_RE.match(email):
            return seite("Bitte prüfen", "<p>Bitte gib eine gültige E-Mail-Adresse an und setze das Häkchen "
                         "zur Einwilligung.</p><p><a href=\"javascript:history.back()\">Zurück</a></p>", 400)
        email = email.lower()
        if not smtp_eingerichtet():
            log.error("Anmeldung abgelehnt: SMTP nicht eingerichtet")
            return seite("Gerade nicht möglich", "<p>Die Anmeldung ist gerade nicht möglich. Bitte versuche es "
                         "später noch einmal.</p>", 503)
        if not begrenzer.ip(request.client.host if request.client else "?"):
            return seite("Zu viele Versuche", "<p>Bitte versuche es in einer Viertelstunde noch einmal.</p>", 429)

        with closing(db()) as con:
            aufraeumen(con)
            eintrag = con.execute("SELECT * FROM eintraege WHERE email = ? AND liste = ?", (email, liste)).fetchone()
            if eintrag is not None and (eintrag["status"] == "bestaetigt"
                                        or (eintrag["letzte_mail_am"] or 0) > jetzt() - ERNEUT_SENDEN_NACH_S):
                return fertig  # nichts verraten, keine weitere Mail
            if eintrag is None:
                text = EINWILLIGUNG_TEXT.format(zweck=LISTEN[liste]["zweck"])
                cur = con.execute(
                    "INSERT INTO eintraege (email, liste, status, angemeldet_am, einwilligung_version, "
                    "einwilligung_text) VALUES (?, ?, 'offen', ?, ?, ?)",
                    (email, liste, jetzt(), EINWILLIGUNG_VERSION, text),
                )
                eintrag = con.execute("SELECT * FROM eintraege WHERE id = ?", (cur.lastrowid,)).fetchone()
            if not begrenzer.mail():
                log.warning("Mail-Obergrenze pro Stunde erreicht")
                return seite("Gerade viel los", "<p>Bitte versuche es in einer Stunde noch einmal.</p>", 429)
            try:
                bestaetigungsmail(eintrag)
            except Exception:
                log.exception("Bestätigungsmail an Eintrag %s fehlgeschlagen", eintrag["id"])
                return seite("Mail nicht verschickt", "<p>Die Bestätigungsmail konnte nicht verschickt werden. "
                             "Bitte versuche es später noch einmal.</p>", 502)
            con.execute("UPDATE eintraege SET letzte_mail_am = ? WHERE id = ?", (jetzt(), eintrag["id"]))
            log.info("Anmeldung offen: Eintrag %s, Liste %s", eintrag["id"], liste)
        return fertig

    @app.get("/api/bestaetigen")
    def bestaetigen_frage(id: str = "", t: str = ""):
        with closing(db()) as con:
            aufraeumen(con)
            if eintrag_pruefen(con, "bestaetigen", id, t) is None:
                return seite(*UNGUELTIG, status=400)
        return knopf_seite("Anmeldung bestätigen", "Ein Klick noch, dann ist deine Anmeldung bestätigt.",
                           "bestaetigen", id, t, "Jetzt bestätigen")

    @app.post("/api/bestaetigen")
    def bestaetigen(id: str = Form(""), t: str = Form("")):
        with closing(db()) as con:
            aufraeumen(con)
            eintrag = eintrag_pruefen(con, "bestaetigen", id, t)
            if eintrag is None:
                return seite(*UNGUELTIG, status=400)
            if eintrag["status"] == "offen":
                con.execute("UPDATE eintraege SET status = 'bestaetigt', bestaetigt_am = ? WHERE id = ?",
                            (jetzt(), eintrag["id"]))
                log.info("Anmeldung bestätigt: Eintrag %s", eintrag["id"])
        abmelden = html.escape(link("abmelden", eintrag))
        return seite("Danke, du bist eingetragen", f"<p>{html.escape(LISTEN[eintrag['liste']]['zweck'])}</p>"
                     f"<p>Abmelden kannst du dich jederzeit über den Link in jeder E-Mail oder "
                     f"<a href=\"{abmelden}\">hier</a>.</p>")

    @app.get("/api/abmelden")
    def abmelden_frage(id: str = "", t: str = ""):
        with closing(db()) as con:
            if eintrag_pruefen(con, "abmelden", id, t) is None:
                return seite(*UNGUELTIG, status=400)
        return knopf_seite("Abmelden", "Möchtest du dich abmelden? Deine Adresse wird dann vollständig gelöscht.",
                           "abmelden", id, t, "Abmelden")

    @app.post("/api/abmelden")
    def abmelden(id: str = Form(""), t: str = Form("")):
        with closing(db()) as con:
            eintrag = eintrag_pruefen(con, "abmelden", id, t)
            if eintrag is not None:
                con.execute("DELETE FROM eintraege WHERE id = ?", (eintrag["id"],))
                log.info("Abgemeldet und gelöscht: Eintrag %s", eintrag["id"])
        return seite("Abgemeldet", "<p>Du bist abgemeldet, deine Adresse ist gelöscht.</p>")

    return app


# --------------------------------------------------------------------------- Verwaltung

def cli(argv: list[str]) -> int:
    befehl, rest = (argv[0], argv[1:]) if argv else ("", [])
    with closing(db()) as con:
        aufraeumen(con)
        if befehl == "zaehlen":
            for r in con.execute("SELECT liste, status, COUNT(*) n FROM eintraege GROUP BY liste, status ORDER BY 1, 2"):
                print(f"{r['liste']:<15} {r['status']:<11} {r['n']}")
            return 0
        if befehl == "export" and len(rest) == 1:
            w = csv.writer(sys.stdout)
            w.writerow(["email", "angemeldet_am", "bestaetigt_am", "einwilligung_version", "abmeldelink"])
            for r in con.execute("SELECT * FROM eintraege WHERE liste = ? AND status = 'bestaetigt' ORDER BY id",
                                 (rest[0],)):
                w.writerow([r["email"], iso(r["angemeldet_am"]), iso(r["bestaetigt_am"]),
                            r["einwilligung_version"], link("abmelden", r)])
            return 0
        if befehl == "loeschen" and len(rest) == 1:
            n = con.execute("DELETE FROM eintraege WHERE email = ?", (rest[0].strip().lower(),)).rowcount
            print(f"{n} Einträge gelöscht")
            return 0
        if befehl == "sichern" and len(rest) == 1:
            import glob
            import gzip
            ziel = os.path.join(rest[0], datetime.now().strftime("website-%Y%m%d-%H%M%S.db"))
            with closing(sqlite3.connect(ziel)) as kopie:
                con.backup(kopie)
            with open(ziel, "rb") as roh, gzip.open(ziel + ".gz", "wb") as gz:
                gz.write(roh.read())
            os.remove(ziel)
            for alt in sorted(glob.glob(os.path.join(rest[0], "website-*.db.gz")))[:-14]:
                os.remove(alt)
            print(ziel + ".gz")
            return 0
        if befehl == "testmail" and len(rest) == 1:
            mail_senden(rest[0], "Testmail vom Website-Server", "Wenn diese Mail ankommt, funktioniert der Versand.")
            print("verschickt")
            return 0
    print("Aufruf: websiteapi.py zaehlen | export LISTE | loeschen EMAIL | testmail EMAIL | sichern ORDNER", file=sys.stderr)
    return 2


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    raise SystemExit(cli(sys.argv[1:]))
