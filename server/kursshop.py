"""Kursshop: Kauf auf der Website (Stripe Checkout) → Einschreibung im Moodle.

Wird von websiteapi.create_app() eingebunden (gleicher Dienst, gleiche Datenbank, gleicher Mailversand).
Stripe und Moodle werden mit der Standardbibliothek (urllib) angesprochen, ohne neue Pakete.

Ablauf
  1. /kurse/ (statisch) → GET /api/kauf/bestellen?produkt=…   Bestellseite mit Preis, Pflicht-Häkchen
     (Zustimmung nach § 356 Abs. 5 BGB, Wohnsitz in Deutschland) und Knopf „Zahlungspflichtig bestellen“.
  2. POST /api/kauf/bestellen   legt eine offene Bestellung an (Zeitpunkt und Wortlaut der Zustimmung) und
     leitet zu Stripe Checkout weiter. Hier wird noch keine Mailadresse gespeichert.
  3. POST /api/kauf/stripe      Webhook von Stripe (Signatur geprüft, jedes Ereignis nur einmal):
       checkout.session.completed / …async_payment_succeeded → Moodle-Konto suchen oder anlegen, einschreiben
                                    (Einzelkurs) bzw. in die Kohorte aufnehmen (Abo), Bestätigungsmail
       invoice.paid                → Abo verlängert: Kohorte sicherstellen
       customer.subscription.deleted / .updated (canceled, unpaid) → aus der Kohorte entfernen
       charge.refunded / charge.dispute.created → Einzelkurs: austragen (im Fehlerfall Mail an bohm);
                                    Abo: in Stripe sofort kündigen, aus der Kohorte entfernen
  GET /api/kauf/produkte        Liste für /kurse/ (sichtbare Produkte, Einstiegskurse nur mit KURSSHOP_FREI_AKTIV=1)
  4. POST /api/kuendigen        Kündigungsschaltfläche nach § 312k BGB (Formular: /vertraege-kuendigen.html).

Rechtliche Punkte sind mit [U] markiert: ungeprüft, keine Rechtsberatung. Siehe server/README.md.

Das Startpasswort neuer Moodle-Konten steht nur in der Bestätigungsmail: nie im Log, nie in der Datenbank.
"""
from __future__ import annotations

import hashlib
import hmac
import html
import json
import logging
import os
import re
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import closing
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Form, Request
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.concurrency import run_in_threadpool

import websiteapi as w

log = logging.getLogger("kursshop")

STRIPE_API = "https://api.stripe.com"
SIGNATUR_TOLERANZ_S = 300
OFFEN_LOESCHEN_NACH_S = 7 * 24 * 3600      # Checkout-Sitzungen laufen nach 24 h ab
EREIGNISSE_LOESCHEN_NACH_S = 90 * 24 * 3600  # Stripe wiederholt höchstens 3 Tage; nur IDs, keine Personendaten
JAHR_S = 365 * 24 * 3600
PREIS_CACHE_S = 600

# [U] Wortlaut der Zustimmung nach § 356 Abs. 5 BGB. Wird mit jeder Bestellung gespeichert und in der
# Bestätigungsmail wiederholt (Bestätigung nach § 312f BGB). Bei Änderung Version erhöhen.
WIDERRUF_VERSION = "2026-11-20"
WIDERRUF_TEXT = (
    "Ich stimme ausdrücklich zu, dass René Bohm (Endlich Feierabend) vor Ablauf der Widerrufsfrist mit der "
    "Ausführung des Vertrags beginnt, indem mein Zugang im Moodle freigeschaltet wird. Mir ist bekannt, dass ich "
    "durch diese Zustimmung mit Beginn der Ausführung des Vertrags mein Widerrufsrecht verliere."
)
# [U] Zum Start nur Kundschaft in Deutschland (Kleinunternehmerregelung, kein OSS). Stripe Checkout kann das
# Rechnungsland nicht beschränken, deshalb Pflicht-Häkchen hier und Prüfung des Landes im Webhook.
WOHNSITZ_TEXT = "Ich habe meinen Wohnsitz in Deutschland und bestelle als Privatperson (Verbraucher/in)."
# [U] Hinweis auf Belegen (Kleinunternehmer). Für Abo-Rechnungen im Stripe-Dashboard als Fußzeile hinterlegen.
BELEG_FUSSZEILE = "Nach § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet."
# [U] Hinweis neben dem Bezahlknopf bei Stripe (dort heißt der Knopf „Bezahlen“ bzw. „Abonnieren“).
STRIPE_KNOPF_HINWEIS = (
    "Mit Klick auf „Bezahlen“ bzw. „Abonnieren“ bestellst du zahlungspflichtig. Es gelten die AGB von "
    "Endlich Feierabend. Nach § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet."
)

AKTIVE_STATUS = ("aktiv", "gekuendigt")

SCHEMA = """
CREATE TABLE IF NOT EXISTS kauf_bestellungen (
    id INTEGER PRIMARY KEY,
    bestellnr TEXT NOT NULL UNIQUE,
    produkt TEXT NOT NULL,
    art TEXT NOT NULL CHECK (art IN ('einzelkurs', 'abo')),
    status TEXT NOT NULL,
    angelegt_am INTEGER NOT NULL,
    widerruf_zustimmung_am INTEGER NOT NULL,
    widerruf_version TEXT NOT NULL,
    widerruf_text TEXT NOT NULL,
    wohnsitz_de_bestaetigt INTEGER NOT NULL DEFAULT 0,
    email TEXT,
    land TEXT,
    betrag_cent INTEGER,
    stripe_session TEXT UNIQUE,
    stripe_customer TEXT,
    stripe_subscription TEXT,
    stripe_payment_intent TEXT,
    moodle_userid INTEGER,
    moodle_username TEXT,
    konto_neu INTEGER NOT NULL DEFAULT 0,
    zugang_mail_am INTEGER,
    bezahlt_am INTEGER,
    bezahlt_bis INTEGER,
    kuendigung_zum INTEGER,
    beendet_am INTEGER,
    notiz TEXT,
    aktualisiert_am INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS kauf_bestellungen_email ON kauf_bestellungen (email);
CREATE INDEX IF NOT EXISTS kauf_bestellungen_sub ON kauf_bestellungen (stripe_subscription);
CREATE INDEX IF NOT EXISTS kauf_bestellungen_pi ON kauf_bestellungen (stripe_payment_intent);
CREATE TABLE IF NOT EXISTS kauf_ereignisse (
    event_id TEXT PRIMARY KEY,
    typ TEXT NOT NULL,
    empfangen_am INTEGER NOT NULL,
    erledigt INTEGER NOT NULL DEFAULT 0,
    versuche INTEGER NOT NULL DEFAULT 0,
    ergebnis TEXT
);
CREATE TABLE IF NOT EXISTS kauf_kuendigungen (
    id INTEGER PRIMARY KEY,
    eingegangen_am INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    vertrag TEXT NOT NULL,
    bestellnr_angabe TEXT,
    art TEXT NOT NULL,
    grund TEXT,
    zeitpunkt TEXT NOT NULL,
    datum TEXT,
    ergebnis TEXT,
    bestaetigung_gesendet INTEGER NOT NULL DEFAULT 0
);
"""


class VoruebergehenderFehler(Exception):
    """Netz, Moodle oder Stripe gerade nicht erreichbar: Stripe soll das Ereignis später erneut senden."""


class Klaerung(Exception):
    """Lässt sich nicht automatisch lösen: Bestellung markieren, bohm benachrichtigen, Stripe nicht wiederholen."""


# --------------------------------------------------------------------------- Konfiguration

_konfig_cache: dict | None = None


def konfig() -> dict:
    global _konfig_cache
    if _konfig_cache is None:
        pfad = os.environ.get("KURSSHOP_KONFIG") or str(Path(__file__).with_name("kursshop.json"))
        with open(pfad, encoding="utf-8") as f:
            _konfig_cache = json.load(f)
    return _konfig_cache


def produkte() -> dict:
    """Alle aktiven Produkte (auch unsichtbare): für Webhooks, Erstattung, Kündigung."""
    return {k: p for k, p in konfig()["produkte"].items() if p.get("aktiv", True)}


def kaufbar() -> dict:
    """Produkte, die auf /kurse/ erscheinen und bestellt werden können (sichtbar: false blendet aus)."""
    return {k: p for k, p in produkte().items() if p.get("sichtbar", True)}


def kostenlose_kurse() -> list[dict]:
    """Einstiegskurse mit „kostenlos starten“; ausgeblendet, solange KURSSHOP_FREI_AKTIV nicht 1 ist."""
    return list(konfig().get("kostenlos", [])) if schalter("KURSSHOP_FREI_AKTIV") else []


def kurs_ids(p: dict) -> list[int]:
    """Moodle-Kurse eines Einzelkaufs: ein Kurs, beim Paket alle enthaltenen (Paket „Alle 3 Kurse“, bohm 27.11.2026)."""
    if p.get("enthaelt"):
        alle = konfig()["produkte"]
        return [alle[k]["moodle_kurs_id"] for k in p["enthaelt"]]
    return [p["moodle_kurs_id"]]


def ersparnis_cent(p: dict) -> int:
    """Beim Paket: Summe der Einzelpreise minus Paketpreis, sonst 0."""
    if not p.get("enthaelt"):
        return 0
    alle = konfig()["produkte"]
    return max(0, sum(alle[k]["preis_cent"] for k in p["enthaelt"]) - p["preis_cent"])


def moodle_url() -> str:
    return os.environ.get("MOODLE_URL") or konfig().get("moodle_url", "https://moodle.endlich-feierabend-ki.de")


def preis_id(produkt: dict) -> str:
    return os.environ.get(produkt["stripe_preis_env"], "").strip()


def kohorte_id(produkt: dict) -> int | None:
    wert = os.environ.get(produkt.get("moodle_kohorte_id_env", ""), "") or str(produkt.get("moodle_kohorte_id") or "")
    return int(wert) if wert.strip().isdigit() else None


def schalter(name: str, standard: bool = False) -> bool:
    wert = os.environ.get(name, "").strip().lower()
    return standard if not wert else wert in ("1", "ja", "true", "an")


def shop_bereit() -> bool:
    return schalter("KURSSHOP_AKTIV") and bool(os.environ.get("STRIPE_SECRET_KEY"))


def status() -> dict:
    return {
        "aktiv": schalter("KURSSHOP_AKTIV"),
        "stripe": bool(os.environ.get("STRIPE_SECRET_KEY")),
        "webhook": bool(os.environ.get("STRIPE_WEBHOOK_SECRET")),
        "moodle": bool(os.environ.get("MOODLE_KURSSHOP_TOKEN")),
        "frei": schalter("KURSSHOP_FREI_AKTIV"),
    }


def euro(cent: int) -> str:
    return f"{cent / 100:.2f}".replace(".", ",") + " €"


def preis_text(p: dict) -> str:
    return euro(p["preis_cent"]) + (f" pro {p['intervall']}" if p["art"] == "abo" else " einmalig")


def ortszeit(ts: int | None) -> str:
    if not ts:
        return ""
    try:
        from zoneinfo import ZoneInfo
        dt = datetime.fromtimestamp(ts, ZoneInfo("Europe/Berlin"))
        return dt.strftime("%d.%m.%Y, %H:%M Uhr")
    except Exception:
        return datetime.fromtimestamp(ts, timezone.utc).strftime("%d.%m.%Y, %H:%M Uhr (UTC)")


def ortsdatum(ts: int | None) -> str:
    return ortszeit(ts).split(",")[0] if ts else ""


# --------------------------------------------------------------------------- Datenbank

def db() -> sqlite3.Connection:
    con = w.db()
    con.executescript(SCHEMA)
    return con


def jahre(name: str, standard: int) -> int:
    wert = os.environ.get(name, "").strip()
    return int(wert) if wert.isdigit() and int(wert) > 0 else standard


def aufraeumen(con: sqlite3.Connection) -> None:
    """Wird auch von websiteapi.aufraeumen() aufgerufen (Anmeldungen, nächtliche Sicherung).

    [U] Fristen sind eine Einschätzung, keine Rechtsauskunft: Bestellungen/Zahlungen 8 Jahre nach Abschluss
    (Buchungsbelege, § 147 AO / § 257 HGB), Kündigungen und Übriges 3 Jahre (regelmäßige Verjährung).
    """
    con.executescript(SCHEMA)
    jetzt = w.jetzt()
    con.execute("DELETE FROM kauf_bestellungen WHERE status = 'offen' AND angelegt_am < ?",
                (jetzt - OFFEN_LOESCHEN_NACH_S,))
    buchung = jetzt - jahre("KURSSHOP_AUFBEWAHRUNG_BUCHUNG_JAHRE", 8) * JAHR_S
    con.execute("DELETE FROM kauf_bestellungen WHERE status NOT IN ('aktiv', 'gekuendigt', 'offen', "
                "'zahlung_ausstehend', 'klaerung') AND COALESCE(beendet_am, bezahlt_am, angelegt_am) < ?", (buchung,))
    con.execute("DELETE FROM kauf_bestellungen WHERE status IN ('zahlung_ausstehend', 'klaerung') "
                "AND angelegt_am < ?", (buchung,))
    sonst = jetzt - jahre("KURSSHOP_AUFBEWAHRUNG_SONST_JAHRE", 3) * JAHR_S
    con.execute("DELETE FROM kauf_kuendigungen WHERE eingegangen_am < ?", (sonst,))
    con.execute("DELETE FROM kauf_ereignisse WHERE erledigt = 1 AND empfangen_am < ?",
                (jetzt - EREIGNISSE_LOESCHEN_NACH_S,))


def bestellung(con: sqlite3.Connection, spalte: str, wert) -> sqlite3.Row | None:
    assert spalte in ("bestellnr", "stripe_session", "stripe_subscription", "stripe_payment_intent")
    return con.execute(f"SELECT * FROM kauf_bestellungen WHERE {spalte} = ? ORDER BY id DESC LIMIT 1",
                       (wert,)).fetchone() if wert else None


def bestellung_setzen(con: sqlite3.Connection, bestellnr: str, **felder) -> None:
    felder["aktualisiert_am"] = w.jetzt()
    zuweisung = ", ".join(f"{k} = ?" for k in felder)
    con.execute(f"UPDATE kauf_bestellungen SET {zuweisung} WHERE bestellnr = ?", (*felder.values(), bestellnr))


def neue_bestellnr() -> str:
    return f"EF-{datetime.now(timezone.utc):%Y%m%d}-{secrets.token_hex(4).upper()}"


# --------------------------------------------------------------------------- HTTP (Stripe, Moodle)

def formular(daten: dict, praefix: str = "") -> list[tuple[str, str]]:
    """Verschachtelte Werte in die Form-Kodierung von Stripe/Moodle: a[b][0][c]=…"""
    paare: list[tuple[str, str]] = []
    for k, v in daten.items():
        schluessel = f"{praefix}[{k}]" if praefix else str(k)
        if isinstance(v, dict):
            paare += formular(v, schluessel)
        elif isinstance(v, (list, tuple)):
            paare += formular({i: x for i, x in enumerate(v)}, schluessel)
        elif isinstance(v, bool):
            paare.append((schluessel, "true" if v else "false"))
        elif v is not None:
            paare.append((schluessel, str(v)))
    return paare


def http_json(url: str, daten: list[tuple[str, str]] | None, kopf: dict, methode: str = "POST") -> tuple[int, dict | list]:
    body = urllib.parse.urlencode(daten).encode() if daten is not None else None
    req = urllib.request.Request(url, data=body, method=methode, headers=kopf)
    try:
        with urllib.request.urlopen(req, timeout=25) as antwort:
            return antwort.status, json.loads(antwort.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        raise VoruebergehenderFehler(f"{urllib.parse.urlsplit(url).netloc} nicht erreichbar: {type(e).__name__}") from None


def stripe_anfrage(methode: str, pfad: str, daten: dict | None = None, idempotenz: str | None = None) -> dict:
    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        raise VoruebergehenderFehler("STRIPE_SECRET_KEY fehlt")
    kopf = {"Authorization": f"Bearer {key}", "Content-Type": "application/x-www-form-urlencoded"}
    if idempotenz:
        kopf["Idempotency-Key"] = idempotenz
    url = STRIPE_API + pfad
    if methode == "GET" and daten:
        url += "?" + urllib.parse.urlencode(formular(daten))
    code, antwort = http_json(url, formular(daten or {}) if methode != "GET" else None, kopf, methode)
    if code >= 500 or code == 429:
        raise VoruebergehenderFehler(f"Stripe {pfad}: HTTP {code}")
    if code >= 400 or not isinstance(antwort, dict):
        meldung = (antwort.get("error") or {}).get("message", "") if isinstance(antwort, dict) else ""
        raise Klaerung(f"Stripe {methode} {pfad}: HTTP {code} {meldung}".strip())
    return antwort


def moodle_aufruf(funktion: str, **params):
    token = os.environ.get("MOODLE_KURSSHOP_TOKEN")
    if not token:
        raise VoruebergehenderFehler("MOODLE_KURSSHOP_TOKEN fehlt")
    daten = [("wstoken", token), ("wsfunction", funktion), ("moodlewsrestformat", "json")] + formular(params)
    code, antwort = http_json(moodle_url().rstrip("/") + "/webservice/rest/server.php", daten,
                              {"Content-Type": "application/x-www-form-urlencoded"})
    if code >= 400:
        raise VoruebergehenderFehler(f"Moodle {funktion}: HTTP {code}")
    if isinstance(antwort, dict) and "exception" in antwort:
        # Meldung ohne Parameter weitergeben (darin könnte ein Startpasswort stehen)
        raise Klaerung(f"Moodle {funktion}: {antwort.get('errorcode', '')} {antwort.get('message', '')}".strip())
    return antwort


# --------------------------------------------------------------------------- Signatur

def signatur_ok(roh: bytes, kopf: str, secret: str, jetzt_s: int | None = None) -> bool:
    """Stripe-Signature: t=<zeit>,v1=<hex>[,v1=…]. HMAC-SHA256 über "<t>.<payload>", Toleranz 5 Minuten."""
    teile: dict[str, list[str]] = {}
    for stueck in (kopf or "").split(","):
        k, _, v = stueck.strip().partition("=")
        teile.setdefault(k, []).append(v)
    try:
        t = int(teile.get("t", [""])[0])
    except ValueError:
        return False
    if abs((jetzt_s if jetzt_s is not None else int(time.time())) - t) > SIGNATUR_TOLERANZ_S:
        return False
    erwartet = hmac.new(secret.encode(), f"{t}.".encode() + roh, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(erwartet, v) for v in teile.get("v1", []))


# --------------------------------------------------------------------------- Mail

def admin_melden(betreff: str, text: str) -> None:
    log.warning("Kursshop: %s", betreff)
    an = os.environ.get("KURSSHOP_ADMIN_MAIL")
    if not an or not w.smtp_eingerichtet():
        return
    try:
        w.mail_senden(an, f"[Kursshop] {betreff}", text)
    except Exception:
        log.exception("Mail an Verwaltung fehlgeschlagen")


def gruss() -> str:
    return "\nViele Grüße\nRené Bohm – Endlich Feierabend\n"


def kundenmail(b: sqlite3.Row, p: dict, username: str, passwort: str | None, konto_neu: bool) -> None:
    m = moodle_url().rstrip("/")
    site = w.cfg("SITE_URL").rstrip("/")
    if p["art"] == "einzelkurs" and p.get("enthaelt"):
        alle = konfig()["produkte"]
        was = f"Dein Paket „{p['titel']}“ ist freigeschaltet."
        direkt = "Deine Kurse:\n" + "".join(f"  {alle[k]['titel']}: {m}/course/view.php?id={alle[k]['moodle_kurs_id']}\n"
                                            for k in p["enthaelt"])
    elif p["art"] == "einzelkurs":
        was = f"Dein Kurs „{p['titel']}“ ist freigeschaltet."
        direkt = f"Direkt zum Kurs: {m}/course/view.php?id={p['moodle_kurs_id']}\n"
    else:
        was = "Dein Abo ist aktiv: Du hast Zugang zu allen Bezahlkursen, solange das Abo läuft."
        direkt = f"Deine Kurse: {m}/my/courses.php\n"
    if konto_neu and passwort:
        zugang = (f"Für dich wurde ein Konto im Moodle angelegt:\n"
                  f"  Anmeldung:     {m}/login/index.php\n"
                  f"  Benutzername:  {username}\n"
                  f"  Startpasswort: {passwort}\n\n"
                  f"Beim ersten Anmelden wählst du ein eigenes Passwort. Bitte bewahre diese Mail nicht dauerhaft "
                  f"mit dem Startpasswort auf.\n")
    elif konto_neu:
        zugang = (f"Für dich wurde ein Konto im Moodle angelegt (Benutzername: {username}).\n"
                  f"Deine Zugangsdaten kommen per Mail von Moodle (Absender: Moodle von Endlich Feierabend). "
                  f"Schau auch im Spam-Ordner nach; falls nichts ankommt, antworte einfach auf diese Mail.\n"
                  f"  Anmeldung: {m}/login/index.php\n")
    else:
        zugang = (f"Du hast schon ein Konto im Moodle (Benutzername: {username}). Melde dich wie gewohnt an:\n"
                  f"  {m}/login/index.php\n"
                  f"Passwort vergessen? Antworte einfach auf diese Mail, dann helfe ich dir weiter.\n")
    abo = ""
    if p["art"] == "abo":
        abo = (f"\nDein Abo verlängert sich jeden {p['intervall']} automatisch und ist jederzeit zum Ende des "
               f"laufenden Abrechnungszeitraums kündbar: {site}/vertraege-kuendigen.html\n")
        if os.environ.get("STRIPE_PORTAL_LOGIN_URL"):
            abo += f"Zahlungsdaten ändern und Rechnungen ansehen: {os.environ['STRIPE_PORTAL_LOGIN_URL']}\n"
    text = f"""Hallo,

danke für deine Bestellung! {was}

{zugang}{direkt}
Nach dem Anmelden landest du auf der Startseite mit dem Community-Bereich: In „Fragen & Antworten“ kannst du
fragen, in „Zeig dein Ergebnis“ zeigen, was du ausprobiert hast: {m}/
{abo}
Deine Bestellung
  Bestellnummer: {b['bestellnr']}
  Produkt:       {p['titel']}
  Preis:         {preis_text(p)} ({BELEG_FUSSZEILE})
  Bestellt am:   {ortszeit(b['bezahlt_am'] or b['angelegt_am'])}
  Den Zahlungsbeleg schickt dir Stripe in einer eigenen E-Mail.
  Es gelten die AGB: {site}/impressum.html#agb

Bestätigung deiner Zustimmung (§ 356 Abs. 5 BGB)
Am {ortszeit(b['widerruf_zustimmung_am'])} hast du vor der Bestellung erklärt:
„{b['widerruf_text']}“
Mit der Freischaltung deines Zugangs ist dein Widerrufsrecht deshalb erloschen.
{gruss()}"""
    w.mail_senden(b["email"], f"Freigeschaltet: {p['titel']} (Bestellung {b['bestellnr']})", text)


# --------------------------------------------------------------------------- Moodle-Konto

def startpasswort() -> str:
    """16 Zeichen, erfüllt die Standard-Passwortregeln von Moodle (Groß, klein, Ziffer, Sonderzeichen)."""
    gruppen = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "-_!?#%*+="]
    zeichen = [secrets.choice(g) for g in gruppen] + [secrets.choice("".join(gruppen)) for _ in range(12)]
    secrets.SystemRandom().shuffle(zeichen)
    return "".join(zeichen)


def name_teilen(name: str) -> tuple[str, str]:
    teile = (name or "").split()
    if not teile:
        return "Teilnehmer/in", "-"
    if len(teile) == 1:
        return teile[0][:100], "-"
    return " ".join(teile[:-1])[:100], teile[-1][:100]


def freier_username(email: str) -> str:
    basis = re.sub(r"[^a-z0-9_.@-]", "-", email.lower())[:90]
    for i in range(1, 50):
        kandidat = basis if i == 1 else f"{basis}-{i}"
        if not moodle_aufruf("core_user_get_users_by_field", field="username", values=[kandidat]):
            return kandidat
    raise Klaerung("Kein freier Benutzername gefunden")


def moodle_konto(email: str, name: str) -> tuple[int, str, str | None, bool]:
    """Sucht das Konto per E-Mail oder legt es an. Gibt (id, username, startpasswort|None, neu) zurück."""
    treffer = moodle_aufruf("core_user_get_users_by_field", field="email", values=[email]) or []
    if len(treffer) > 1:
        raise Klaerung(f"Mehrere Moodle-Konten mit derselben E-Mail-Adresse ({len(treffer)})")
    if treffer:
        return int(treffer[0]["id"]), treffer[0]["username"], None, False
    vorname, nachname = name_teilen(name)
    username = freier_username(email)
    konto = {"username": username, "firstname": vorname, "lastname": nachname, "email": email}
    passwort = None
    if schalter("MOODLE_CREATEPASSWORD"):
        konto["createpassword"] = 1  # erst einschalten, wenn Moodle Mails verschickt
    else:
        passwort = startpasswort()
        konto["password"] = passwort
        konto["preferences"] = [{"type": "auth_forcepasswordchange", "value": "1"}]
    neu = moodle_aufruf("core_user_create_users", users=[konto])
    return int(neu[0]["id"]), neu[0]["username"], passwort, True


def kohorte_hinzufuegen(p: dict, userid: int) -> None:
    antwort = moodle_aufruf("core_cohort_add_cohort_members", members=[{
        "cohorttype": {"type": "idnumber", "value": p["moodle_kohorte"]},
        "usertype": {"type": "id", "value": userid},
    }])
    for warnung in (antwort or {}).get("warnings", []) if isinstance(antwort, dict) else []:
        log.warning("Moodle-Kohorte: %s", warnung.get("warningcode") or warnung.get("message"))


def kohorte_entfernen(p: dict, b: sqlite3.Row, grund: str) -> str:
    cid = kohorte_id(p)
    if not b["moodle_userid"]:
        return "kein Moodle-Konto bekannt"
    if cid is None:
        admin_melden(f"Bitte aus Kohorte entfernen ({b['bestellnr']})",
                     f"{grund}. Die Kohorten-ID ist nicht eingetragen ({p.get('moodle_kohorte_id_env')}).\n"
                     f"Bitte im Moodle Benutzer {b['moodle_username']} (id {b['moodle_userid']}) aus der Kohorte "
                     f"„{p['moodle_kohorte']}“ entfernen: {moodle_url()}/cohort/index.php\n")
        return "Kohorten-ID fehlt, Verwaltung benachrichtigt"
    moodle_aufruf("core_cohort_delete_cohort_members", members=[{"cohortid": cid, "userid": b["moodle_userid"]}])
    return "aus Kohorte entfernt"


# --------------------------------------------------------------------------- Ereignisse

def abo_id(rechnung: dict) -> str | None:
    s = rechnung.get("subscription")
    if isinstance(s, dict):
        s = s.get("id")
    if not s:  # neuere API-Versionen
        s = ((rechnung.get("parent") or {}).get("subscription_details") or {}).get("subscription")
    return s


def periodenende(sub: dict) -> int | None:
    if sub.get("cancel_at"):
        return int(sub["cancel_at"])
    if sub.get("current_period_end"):
        return int(sub["current_period_end"])
    enden = [i.get("current_period_end") for i in (sub.get("items") or {}).get("data", []) if i.get("current_period_end")]
    return int(max(enden)) if enden else None


def checkout_fertig(con: sqlite3.Connection, s: dict) -> str:
    meta = s.get("metadata") or {}
    nr = meta.get("bestellnr") or s.get("client_reference_id")
    p = produkte().get(meta.get("produkt", ""))
    if not nr or p is None:
        return "ignoriert: keine Bestellung aus dem Kursshop"
    b = bestellung(con, "bestellnr", nr)
    if b is None:  # z. B. offene Bestellung schon aufgeräumt: aus den Metadaten wiederherstellen
        zustimmung = int(meta.get("widerruf_zustimmung_ts") or 0)
        if not zustimmung:
            raise Klaerung(f"Bestellung {nr} unbekannt und ohne Zustimmungszeitpunkt")
        con.execute(
            "INSERT INTO kauf_bestellungen (bestellnr, produkt, art, status, angelegt_am, widerruf_zustimmung_am, "
            "widerruf_version, widerruf_text, wohnsitz_de_bestaetigt, aktualisiert_am) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (nr, meta["produkt"], p["art"], "offen", zustimmung, zustimmung, meta.get("widerruf_version", "?"),
             WIDERRUF_TEXT if meta.get("widerruf_version") == WIDERRUF_VERSION else "(Wortlaut siehe Version)",
             1, w.jetzt()))
        b = bestellung(con, "bestellnr", nr)
    if b["status"] not in ("offen", "zahlung_ausstehend"):
        return f"schon bearbeitet ({b['status']})"

    details = s.get("customer_details") or {}
    email = (details.get("email") or s.get("customer_email") or "").strip().lower()
    land = ((details.get("address") or {}).get("country") or "").upper()
    bestellung_setzen(con, nr, email=email or None, land=land or None, stripe_session=s.get("id"),
                      stripe_customer=s.get("customer"), stripe_subscription=s.get("subscription"),
                      stripe_payment_intent=s.get("payment_intent"), betrag_cent=s.get("amount_total"))
    if s.get("payment_status") not in ("paid", "no_payment_required"):
        bestellung_setzen(con, nr, status="zahlung_ausstehend")
        return "wartet auf Zahlungseingang"
    if len(email) > 254 or not w.EMAIL_RE.match(email):
        raise Klaerung(f"Bestellung {nr}: keine gültige E-Mail-Adresse von Stripe")
    if not w.smtp_eingerichtet():
        raise VoruebergehenderFehler("SMTP nicht eingerichtet, Freischaltung später")  # sonst ginge das Passwort verloren

    userid, username, passwort, neu = moodle_konto(email, details.get("name") or "")
    # Konto vermerken, bevor etwas anderes schiefgehen kann (Passwort selbst wird nie gespeichert)
    konto_neu = neu or (b["konto_neu"] and b["moodle_userid"] == userid)
    bestellung_setzen(con, nr, moodle_userid=userid, moodle_username=username, konto_neu=int(bool(konto_neu)))
    if p["art"] == "einzelkurs":
        moodle_aufruf("enrol_manual_enrol_users",
                      enrolments=[{"roleid": 5, "userid": userid, "courseid": k} for k in kurs_ids(p)])
    else:
        kohorte_hinzufuegen(p, userid)
    bestellung_setzen(con, nr, status="aktiv", bezahlt_am=w.jetzt())
    b = bestellung(con, "bestellnr", nr)
    log.info("Bestellung %s freigeschaltet (%s, Moodle-Konto %s, neu=%s)", nr, b["produkt"], userid, neu)

    passwort_fehlt = konto_neu and not neu and not schalter("MOODLE_CREATEPASSWORD")
    try:
        kundenmail(b, p, username, passwort, bool(konto_neu))
        bestellung_setzen(con, nr, zugang_mail_am=w.jetzt())
    except Exception:
        log.exception("Bestätigungsmail zu Bestellung %s fehlgeschlagen", nr)
        passwort_fehlt = passwort_fehlt or bool(passwort)
        admin_melden(f"Bestätigungsmail fehlgeschlagen ({nr})",
                     f"Die Freischaltung ist erfolgt, die Mail an {email} aber nicht angekommen.\n")
    if passwort_fehlt:
        admin_melden(f"Startpasswort nicht zugestellt ({nr})",
                     f"Das Moodle-Konto {username} (id {userid}) wurde angelegt, das Startpasswort ist aber nicht "
                     f"beim Kunden angekommen. Bitte im Moodle ein Passwort setzen und {email} mitteilen.\n")
    admin_melden(f"Neuer Kauf: {p['titel']} ({nr})",
                 f"Bestellung {nr}\nProdukt: {p['titel']} ({preis_text(p)})\nE-Mail: {email}\nLand: {land or '?'}\n"
                 f"Moodle: {username} (id {userid}, {'neu' if neu else 'vorhanden'})\n")
    if land != "DE":
        admin_melden(f"Kauf außerhalb Deutschlands ({nr})",
                     f"Rechnungsland laut Stripe: {land or 'unbekannt'}. Zum Start verkaufen wir nur nach Deutschland "
                     f"(Kleinunternehmerregelung). Bitte prüfen, ob erstattet werden soll. [U]\n")
    return "freigeschaltet"


def rechnung_bezahlt(con: sqlite3.Connection, inv: dict) -> str:
    sub = abo_id(inv)
    b = bestellung(con, "stripe_subscription", sub)
    if b is None:
        return "ignoriert: kein Abo aus dem Kursshop bekannt (erste Rechnung kommt ggf. vor dem Checkout-Ereignis)"
    p = konfig()["produkte"].get(b["produkt"])
    if b["status"] in ("offen", "zahlung_ausstehend"):
        return "Freischaltung erfolgt über checkout.session.completed"
    if b["status"] == "beendet" or p is None:
        return f"ignoriert ({b['status']})"
    ende = None
    for zeile in (inv.get("lines") or {}).get("data", []):
        ende = max(ende or 0, int((zeile.get("period") or {}).get("end") or 0)) or None
    kohorte_hinzufuegen(p, b["moodle_userid"])
    neuer_status = "gekuendigt" if b["status"] == "gekuendigt" else "aktiv"
    bestellung_setzen(con, b["bestellnr"], status=neuer_status, bezahlt_bis=ende)
    return "Abo verlängert, Kohorte sichergestellt"


def abo_ende(con: sqlite3.Connection, sub: dict, grund: str) -> str:
    b = bestellung(con, "stripe_subscription", sub.get("id"))
    if b is None:
        return "ignoriert: kein Abo aus dem Kursshop bekannt"
    if b["status"] in ("beendet", "erstattet"):
        return f"schon erledigt ({b['status']})"
    p = konfig()["produkte"].get(b["produkt"])
    ergebnis = kohorte_entfernen(p, b, grund) if p else "Produkt unbekannt"
    bestellung_setzen(con, b["bestellnr"], status="beendet", beendet_am=w.jetzt(),
                      notiz=f"{grund}: {ergebnis}")
    log.info("Abo %s beendet (%s): %s", b["bestellnr"], grund, ergebnis)
    return ergebnis


def abo_geaendert(con: sqlite3.Connection, sub: dict) -> str:
    if sub.get("status") in ("canceled", "unpaid", "incomplete_expired"):
        return abo_ende(con, sub, f"Abo-Status {sub.get('status')}")
    b = bestellung(con, "stripe_subscription", sub.get("id"))
    if b is None or b["status"] not in AKTIVE_STATUS:
        return "ignoriert"
    if sub.get("cancel_at_period_end") or sub.get("cancel_at"):
        bestellung_setzen(con, b["bestellnr"], status="gekuendigt", kuendigung_zum=periodenende(sub))
        return "Kündigung zum Periodenende vermerkt"
    if b["status"] == "gekuendigt":
        bestellung_setzen(con, b["bestellnr"], status="aktiv", kuendigung_zum=None)
        return "Kündigung zurückgenommen"
    return "keine Änderung"


def austragen_melden(b: sqlite3.Row, p: dict, anlass: str, warum: str) -> None:
    admin_melden(f"Bitte austragen: {anlass} ({b['bestellnr']})",
                 f"{anlass} zu Bestellung {b['bestellnr']} ({p['titel']}, {b['email']}).\n{warum}\n"
                 f"Bitte im Moodle Benutzer {b['moodle_username']} (id {b['moodle_userid']}) austragen aus:\n"
                 + "".join(f"  Kurs {k}: {moodle_url()}/user/index.php?id={k}\n" for k in kurs_ids(p)))


def abo_sofort_beenden(b: sqlite3.Row, anlass: str) -> str:
    """Erstattung/Rückbuchung beim Abo: Abo in Stripe sofort kündigen (nicht erst zum Periodenende)."""
    if not b["stripe_subscription"]:
        return "kein Stripe-Abo bekannt"
    try:
        stripe_anfrage("DELETE", f"/v1/subscriptions/{b['stripe_subscription']}",
                       idempotenz=f"erstattung-{b['bestellnr']}")
        return "Abo in Stripe sofort gekündigt"
    except Klaerung as e:  # z. B. schon gekündigt
        admin_melden(f"Abo nicht gekündigt ({b['bestellnr']})",
                     f"{anlass}: Das Abo {b['stripe_subscription']} ließ sich in Stripe nicht kündigen ({e}). "
                     f"Bitte im Dashboard prüfen.\n")
        return "Abo-Kündigung in Stripe fehlgeschlagen, Verwaltung benachrichtigt"


def zahlung_zurueck(con: sqlite3.Connection, obj: dict, typ: str) -> str:
    """charge.refunded (obj = Charge) oder charge.dispute.created (obj = Dispute)."""
    if typ == "charge.refunded" and not obj.get("refunded"):
        anlass = f"Teilerstattung ({euro(obj.get('amount_refunded') or 0)})"
        b = bestellung(con, "stripe_payment_intent", obj.get("payment_intent"))
        admin_melden(f"Teilerstattung ({b['bestellnr'] if b else obj.get('id')})",
                     f"{anlass}. Die Einschreibung bleibt bestehen. Bitte prüfen.\n")
        return "Teilerstattung: nur gemeldet"
    anlass = "Erstattung" if typ == "charge.refunded" else "Zahlungsrückbuchung (Dispute)"
    b = bestellung(con, "stripe_payment_intent", obj.get("payment_intent"))
    if b is None:  # Abo: Zahlung gehört zu einer Rechnung, Zuordnung über die Kundschaft
        kunde = obj.get("customer")
        if not kunde and obj.get("charge"):
            kunde = stripe_anfrage("GET", f"/v1/charges/{obj['charge']}").get("customer")
        if kunde:
            treffer = con.execute("SELECT * FROM kauf_bestellungen WHERE stripe_customer = ? AND art = 'abo' "
                                  "AND status IN ('aktiv', 'gekuendigt') ORDER BY id DESC", (kunde,)).fetchall()
            if len(treffer) > 1:
                raise Klaerung(f"{anlass}: mehrere Abos zur Stripe-Kundschaft {kunde}")
            b = treffer[0] if treffer else None
    if b is None:
        return "ignoriert: keine Bestellung aus dem Kursshop gefunden"
    if b["status"] in ("erstattet", "beendet"):
        return f"schon bearbeitet ({b['status']})"
    p = konfig()["produkte"].get(b["produkt"])
    if p is None or not b["moodle_userid"]:
        raise Klaerung(f"{anlass} zu {b['bestellnr']}: Produkt oder Moodle-Konto unbekannt")
    if p["art"] == "abo":
        ergebnis = abo_sofort_beenden(b, anlass)
        ergebnis += "; " + kohorte_entfernen(p, b, anlass)
        admin_melden(f"{anlass} beim Abo ({b['bestellnr']})", f"{b['email']}: {ergebnis}.\n")
    elif schalter("KURSSHOP_AUSTRAGEN", standard=True):
        try:
            moodle_aufruf("enrol_manual_unenrol_users", enrolments=[
                {"roleid": 5, "userid": b["moodle_userid"], "courseid": k} for k in kurs_ids(p)])
            ergebnis = "aus dem Kurs ausgetragen" if len(kurs_ids(p)) == 1 else "aus allen Kursen des Pakets ausgetragen"
            admin_melden(f"{anlass}: ausgetragen ({b['bestellnr']})", f"{b['email']}: {ergebnis}.\n")
        except Klaerung as e:
            ergebnis = "Austragen fehlgeschlagen, Verwaltung benachrichtigt"
            austragen_melden(b, p, anlass, f"Automatisches Austragen fehlgeschlagen: {e}")
    else:
        ergebnis = "Austragen nötig, Verwaltung benachrichtigt"
        austragen_melden(b, p, anlass, "Automatisches Austragen ist abgeschaltet (KURSSHOP_AUSTRAGEN=0).")
    bestellung_setzen(con, b["bestellnr"], status="erstattet", beendet_am=w.jetzt(), notiz=f"{anlass}: {ergebnis}")
    log.info("Bestellung %s: %s, %s", b["bestellnr"], anlass, ergebnis)
    return ergebnis


def ereignis_verarbeiten(con: sqlite3.Connection, event: dict) -> str:
    typ = event.get("type", "")
    obj = (event.get("data") or {}).get("object") or {}
    if typ in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        return checkout_fertig(con, obj)
    if typ == "invoice.paid":
        return rechnung_bezahlt(con, obj)
    if typ == "customer.subscription.deleted":
        return abo_ende(con, obj, "Abo beendet")
    if typ == "customer.subscription.updated":
        return abo_geaendert(con, obj)
    if typ in ("charge.refunded", "charge.dispute.created"):
        return zahlung_zurueck(con, obj, typ)
    return "ignoriert: Ereignisart nicht abonniert"


_webhook_sperre = threading.Lock()


def webhook_verarbeiten(event: dict) -> JSONResponse:
    eid, typ = str(event.get("id", "")), str(event.get("type", ""))
    if not eid.startswith("evt_"):
        return JSONResponse({"fehler": "kein Ereignis"}, status_code=400)
    with _webhook_sperre, closing(db()) as con:
        aufraeumen(con)
        alt = con.execute("SELECT * FROM kauf_ereignisse WHERE event_id = ?", (eid,)).fetchone()
        if alt is not None and alt["erledigt"]:
            return JSONResponse({"status": "schon verarbeitet"})
        con.execute("INSERT INTO kauf_ereignisse (event_id, typ, empfangen_am, versuche) VALUES (?, ?, ?, 1) "
                    "ON CONFLICT(event_id) DO UPDATE SET versuche = versuche + 1", (eid, typ, w.jetzt()))
        try:
            ergebnis, code = ereignis_verarbeiten(con, event), 200
        except VoruebergehenderFehler as e:
            log.warning("Ereignis %s (%s) später erneut: %s", eid, typ, e)
            con.execute("UPDATE kauf_ereignisse SET ergebnis = ? WHERE event_id = ?", (f"wiederholen: {e}", eid))
            return JSONResponse({"status": "später erneut"}, status_code=503)
        except Klaerung as e:
            ergebnis, code = f"Klärung: {e}", 200
            nr = (((event.get("data") or {}).get("object") or {}).get("metadata") or {}).get("bestellnr")
            if nr:
                bestellung_setzen(con, nr, status="klaerung", notiz=str(e)[:500])
            admin_melden(f"Klärung nötig ({typ})", f"Ereignis {eid} ({typ}): {e}\n")
        except Exception as e:
            log.exception("Ereignis %s (%s) fehlgeschlagen", eid, typ)
            con.execute("UPDATE kauf_ereignisse SET ergebnis = ? WHERE event_id = ?",
                        (f"Fehler: {type(e).__name__}", eid))
            return JSONResponse({"status": "Fehler"}, status_code=500)
        con.execute("UPDATE kauf_ereignisse SET erledigt = 1, ergebnis = ? WHERE event_id = ?", (ergebnis[:500], eid))
        log.info("Ereignis %s (%s): %s", eid, typ, ergebnis)
        return JSONResponse({"status": "ok", "ergebnis": ergebnis}, status_code=code)


# --------------------------------------------------------------------------- Bestellen

_preis_cache: dict[str, tuple[float, dict]] = {}


def stripe_preis(pid: str) -> dict:
    eintrag = _preis_cache.get(pid)
    if eintrag and eintrag[0] > time.monotonic():
        return eintrag[1]
    preis = stripe_anfrage("GET", f"/v1/prices/{urllib.parse.quote(pid)}")
    _preis_cache[pid] = (time.monotonic() + PREIS_CACHE_S, preis)
    return preis


def preis_passt(p: dict, preis: dict) -> bool:
    return (preis.get("active") and preis.get("currency") == "eur" and preis.get("unit_amount") == p["preis_cent"]
            and (preis.get("type") == "recurring") == (p["art"] == "abo"))


def checkout_daten(nr: str, key: str, p: dict, pid: str, zustimmung: int) -> dict:
    site = w.cfg("SITE_URL").rstrip("/")
    meta = {"bestellnr": nr, "produkt": key, "widerruf_zustimmung_ts": zustimmung,
            "widerruf_zustimmung": datetime.fromtimestamp(zustimmung, timezone.utc).isoformat(timespec="seconds"),
            "widerruf_version": WIDERRUF_VERSION, "wohnsitz_de_bestaetigt": "ja"}
    daten: dict = {
        "mode": "subscription" if p["art"] == "abo" else "payment",
        "line_items": [{"price": pid, "quantity": 1}],
        "success_url": f"{site}/kurse/danke.html?bestellung={nr}",
        "cancel_url": f"{site}/kurse/abbruch.html",
        "client_reference_id": nr,
        "locale": "de",
        "billing_address_collection": "required",  # Name fürs Moodle-Konto, Land zur Prüfung
        "metadata": meta,
        "custom_text": {"submit": {"message": STRIPE_KNOPF_HINWEIS}},
    }
    if p["art"] == "abo":
        daten["subscription_data"] = {"metadata": meta}
    else:
        daten["customer_creation"] = "always"
        daten["payment_intent_data"] = {"metadata": meta}
        daten["invoice_creation"] = {"enabled": True, "invoice_data": {
            "footer": BELEG_FUSSZEILE, "description": p["titel"], "metadata": {"bestellnr": nr}}}
    return daten


def bestellseite(key: str, p: dict, fehler: str = "", status: int = 200):
    e = html.escape
    abo = p["art"] == "abo"
    hinweis = f'<p class="kauf-fehler">{e(fehler)}</p>' if fehler else ""
    paket = ""
    if p.get("enthaelt"):
        alle = konfig()["produkte"]
        paket = ("<ul>" + "".join(f"<li>{e(alle[k]['titel'])} ({e(euro(alle[k]['preis_cent']))} einzeln)</li>"
                                  for k in p["enthaelt"]) + "</ul>"
                 + f"<p><strong>Du sparst {e(euro(ersparnis_cent(p)))}.</strong> {e(p.get('paket_hinweis', ''))}</p>")
    laufzeit = (f"Das Abo verlängert sich jeden {e(p['intervall'])} automatisch und ist jederzeit zum Ende des "
                f"laufenden Abrechnungszeitraums kündbar.") if abo else ("Einmalige Zahlung, dauerhafter Zugang zu allen Kursen des Pakets." if p.get("enthaelt") else "Einmalige Zahlung, dauerhafter Zugang zum Kurs.")
    inhalt = f"""<style>.kauf{{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);
padding:24px;margin:20px 0;box-shadow:var(--shadow-sm)}}.kauf .preis{{font-family:var(--display);font-weight:800;
font-size:30px;color:var(--ink)}}.kauf p{{color:var(--text-soft);font-size:16px}}.kauf-check{{display:flex;gap:12px;
align-items:flex-start;margin:14px 0;font-size:15.5px;line-height:1.55}}.kauf-check input{{margin-top:5px;
width:20px;height:20px;flex-shrink:0}}.kauf-fehler{{background:var(--rot-tint);color:var(--rot);padding:12px 16px;
border-radius:var(--r)}}.klein{{font-size:14px;color:var(--text-soft);margin-top:14px}}
.hp{{position:absolute;left:-9999px}}</style>
{hinweis}
<div class="kauf"><h3>{e(p['titel'])}</h3><p>{e(p['beschreibung'])}</p>{paket}
<div class="preis">{e(preis_text(p))}</div>
<p>Nach § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet. {laufzeit}</p></div>
<form method="post" action="/api/kauf/bestellen">
<input type="hidden" name="produkt" value="{e(key)}">
<label class="hp" aria-hidden="true">Bitte leer lassen <input name="website" tabindex="-1" autocomplete="off"></label>
<label class="kauf-check"><input type="checkbox" name="widerruf" value="ja" required>
<span>{e(WIDERRUF_TEXT)}</span></label>
<label class="kauf-check"><input type="checkbox" name="wohnsitz" value="ja" required>
<span>{e(WOHNSITZ_TEXT)}</span></label>
<p class="klein">Es gelten die <a href="/impressum.html#agb">AGB</a>. Hinweise zum
<a href="/impressum.html#widerruf">Widerrufsrecht</a> und zum <a href="/impressum.html#datenschutz">Datenschutz</a>.
Im nächsten Schritt gibst du bei unserem Zahlungsdienstleister Stripe deine E-Mail-Adresse und Zahlungsdaten ein.
Mit dieser E-Mail-Adresse wird dein Zugang im Moodle angelegt.</p>
<p style="margin-top:22px"><button type="submit" class="btn btn--primary btn--lg">Zahlungspflichtig bestellen</button></p>
</form>
<p class="klein"><a href="/kurse/">Zurück zur Kursübersicht</a></p>"""
    return w.seite("Bestellung", inhalt, status)


def einbinden(app: FastAPI) -> None:
    begrenzer_kauf, begrenzer_kuendigen = w.Begrenzer(), w.Begrenzer()
    with closing(db()) as con:
        aufraeumen(con)

    def nicht_offen():
        return w.seite("Buchung noch nicht geöffnet", "<p>Die Buchung über die Website ist noch nicht geöffnet. "
                       "Bitte schau bald wieder vorbei.</p><p><a href=\"/kurse/\">Zur Kursübersicht</a></p>", 503)

    @app.get("/api/kauf/produkte")
    def produktliste():
        """Für /kurse/: welche Kurse gerade angezeigt werden (Schalter wirken ohne Neubau der Seite)."""
        m = moodle_url().rstrip("/")
        return JSONResponse({
            "buchung_offen": shop_bereit(),
            "kaufbar": [{"produkt": k, "art": p["art"], "titel": p["titel"], "beschreibung": p["beschreibung"],
                         "preis": euro(p["preis_cent"]),
                         "preis_zusatz": f"pro {p['intervall']}" if p["art"] == "abo" else "einmalig",
                         "platzhalter": bool(p.get("platzhalter")),
                         "paket": bool(p.get("enthaelt")),
                         "ersparnis": euro(ersparnis_cent(p)).replace(",00", "") if ersparnis_cent(p) else "",
                         "hinweis": p.get("paket_hinweis", ""),
                         "link": f"/api/kauf/bestellen?produkt={k}"}
                        for k, p in sorted(kaufbar().items(), key=lambda kp: not kp[1].get("enthaelt"))],
            "kostenlos": [{"titel": f["titel"], "beschreibung": f["beschreibung"],
                           "link": f"{m}/course/view.php?id={f['moodle_kurs_id']}"} for f in kostenlose_kurse()],
        }, headers={"Cache-Control": "no-cache"})

    @app.get("/api/kauf/bestellen")
    def bestellen_seite(produkt: str = ""):
        p = kaufbar().get(produkt)
        if p is None:
            return w.seite("Nicht gefunden", "<p>Dieses Angebot gibt es nicht (mehr).</p>"
                           "<p><a href=\"/kurse/\">Zur Kursübersicht</a></p>", 404)
        if not shop_bereit():
            return nicht_offen()
        return bestellseite(produkt, p)

    @app.post("/api/kauf/bestellen")
    def bestellen(request: Request, produkt: str = Form(""), widerruf: str = Form(""), wohnsitz: str = Form(""),
                  website: str = Form("")):
        p = kaufbar().get(produkt)
        if p is None or website:
            return w.seite("Nicht gefunden", "<p>Dieses Angebot gibt es nicht (mehr).</p>", 404)
        if not shop_bereit():
            return nicht_offen()
        if widerruf != "ja" or wohnsitz != "ja":
            return bestellseite(produkt, p, "Bitte bestätige beide Punkte, um fortzufahren.", 400)
        if not begrenzer_kauf.ip(request.client.host if request.client else "?"):
            return w.seite("Zu viele Versuche", "<p>Bitte versuche es in einer Viertelstunde noch einmal.</p>", 429)
        pid = preis_id(p)
        try:
            if not pid or not preis_passt(p, stripe_preis(pid)):
                log.error("Preis für %s fehlt oder passt nicht zur Konfiguration", produkt)
                return nicht_offen()
            nr, zustimmung = neue_bestellnr(), w.jetzt()
            with closing(db()) as con:
                con.execute(
                    "INSERT INTO kauf_bestellungen (bestellnr, produkt, art, status, angelegt_am, "
                    "widerruf_zustimmung_am, widerruf_version, widerruf_text, wohnsitz_de_bestaetigt, aktualisiert_am) "
                    "VALUES (?, ?, ?, 'offen', ?, ?, ?, ?, 1, ?)",
                    (nr, produkt, p["art"], zustimmung, zustimmung, WIDERRUF_VERSION, WIDERRUF_TEXT, zustimmung))
                sitzung = stripe_anfrage("POST", "/v1/checkout/sessions",
                                         checkout_daten(nr, produkt, p, pid, zustimmung), idempotenz=f"checkout-{nr}")
                bestellung_setzen(con, nr, stripe_session=sitzung["id"])
        except (VoruebergehenderFehler, Klaerung) as e:
            log.error("Checkout für %s nicht möglich: %s", produkt, e)
            return w.seite("Gerade nicht möglich", "<p>Die Zahlungsseite ist gerade nicht erreichbar. Bitte versuche "
                           "es später noch einmal.</p>", 502)
        log.info("Bestellung %s offen (%s), weiter zu Stripe", nr, produkt)
        return RedirectResponse(sitzung["url"], status_code=303)

    @app.post("/api/kauf/stripe")
    async def stripe_webhook(request: Request):
        secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
        if not secret:
            log.error("Webhook abgelehnt: STRIPE_WEBHOOK_SECRET fehlt")
            return JSONResponse({"fehler": "nicht eingerichtet"}, status_code=503)
        roh = await request.body()
        if len(roh) > 1_000_000:
            return JSONResponse({"fehler": "zu groß"}, status_code=413)
        if not signatur_ok(roh, request.headers.get("stripe-signature", ""), secret):
            log.warning("Webhook mit ungültiger Signatur abgelehnt")
            return JSONResponse({"fehler": "Signatur ungültig"}, status_code=400)
        try:
            event = json.loads(roh)
        except ValueError:
            return JSONResponse({"fehler": "kein JSON"}, status_code=400)
        return await run_in_threadpool(webhook_verarbeiten, event)

    @app.post("/api/kuendigen")
    def kuendigen(request: Request, name: str = Form(""), email: str = Form(""), vertrag: str = Form(""),
                  bestellnr: str = Form(""), art: str = Form(""), grund: str = Form(""),
                  zeitpunkt: str = Form(""), datum: str = Form(""), website: str = Form("")):
        if website:
            return w.seite("Danke", "<p>Deine Eingabe ist eingegangen.</p>")
        name, email, bestellnr, grund = name.strip()[:200], email.strip().lower(), bestellnr.strip()[:40], grund.strip()[:2000]
        datum_ok = zeitpunkt != "datum" or _datum_gueltig(datum)
        if (not name or len(email) > 254 or not w.EMAIL_RE.match(email) or art not in KUENDIGUNG_ARTEN
                or zeitpunkt not in KUENDIGUNG_ZEITPUNKTE or not datum_ok or vertrag not in vertragsauswahl()):
            return w.seite("Bitte prüfen", "<p>Bitte gib deinen Namen, eine gültige E-Mail-Adresse, den Vertrag, die "
                           "Art der Kündigung und den Zeitpunkt an (bei „zu einem Datum“ ein gültiges Datum).</p>"
                           "<p><a href=\"javascript:history.back()\">Zurück</a></p>", 400)
        if not begrenzer_kuendigen.ip(request.client.host if request.client else "?"):
            return w.seite("Zu viele Versuche", "<p>Bitte versuche es in einer Viertelstunde noch einmal oder schreib "
                           "uns eine E-Mail.</p>", 429)
        return kuendigung_bearbeiten(name, email, vertrag, bestellnr, art, grund, zeitpunkt,
                                     datum if zeitpunkt == "datum" else "")


# --------------------------------------------------------------------------- Kündigung (§ 312k BGB) [U]

KUENDIGUNG_ARTEN = {"ordentlich": "ordentliche Kündigung", "ausserordentlich": "außerordentliche Kündigung"}
KUENDIGUNG_ZEITPUNKTE = {"naechstmoeglich": "zum nächstmöglichen Zeitpunkt", "datum": "zu einem bestimmten Datum"}


def vertragsauswahl() -> dict:
    auswahl = {k: p["titel"] for k, p in konfig()["produkte"].items() if p["art"] == "abo"}
    auswahl["sonstiges"] = "Anderer Vertrag"
    return auswahl


def _datum_gueltig(text: str) -> bool:
    try:
        return date.fromisoformat(text) >= date.today()
    except ValueError:
        return False


def kuendigung_bearbeiten(name, email, vertrag, bestellnr, art, grund, zeitpunkt, datum):
    eingang = w.jetzt()
    erklaerung = [
        ("Name", name), ("E-Mail-Adresse", email), ("Vertrag", vertragsauswahl()[vertrag]),
        ("Bestellnummer", bestellnr or "nicht angegeben"), ("Art", KUENDIGUNG_ARTEN[art]),
        ("Grund", grund or "nicht angegeben"),
        ("Zeitpunkt", KUENDIGUNG_ZEITPUNKTE[zeitpunkt] + (f" ({date.fromisoformat(datum):%d.%m.%Y})" if datum else "")),
        ("Eingegangen am", ortszeit(eingang)),
    ]
    ergebnisse: list[str] = []
    manuell = False
    with closing(db()) as con:
        cur = con.execute(
            "INSERT INTO kauf_kuendigungen (eingegangen_am, name, email, vertrag, bestellnr_angabe, art, grund, "
            "zeitpunkt, datum) VALUES (?,?,?,?,?,?,?,?,?)",
            (eingang, name, email, vertrag, bestellnr or None, art, grund or None, zeitpunkt, datum or None))
        kid = cur.lastrowid
        abos = con.execute("SELECT * FROM kauf_bestellungen WHERE art = 'abo' AND email = ? AND status IN "
                           "('aktiv', 'gekuendigt') ORDER BY id", (email,)).fetchall()
        if vertrag != "sonstiges":
            abos = [b for b in abos if b["produkt"] == vertrag]
        if not abos:
            manuell = True
            ergebnisse.append("Unter dieser E-Mail-Adresse haben wir keinen laufenden Vertrag gefunden. Wir prüfen "
                              "deine Kündigung von Hand und bestätigen dir das Vertragsende gesondert.")
        elif art != "ordentlich" or zeitpunkt != "naechstmoeglich":
            manuell = True
            ergebnisse.append("Wir prüfen deine Kündigung von Hand und bestätigen dir das Vertragsende gesondert.")
        else:
            for b in abos:
                try:
                    sub = stripe_anfrage("POST", f"/v1/subscriptions/{b['stripe_subscription']}",
                                         {"cancel_at_period_end": True}, idempotenz=f"kuendigung-{kid}-{b['id']}")
                    ende = periodenende(sub)
                    bestellung_setzen(con, b["bestellnr"], status="gekuendigt", kuendigung_zum=ende)
                    ergebnisse.append(f"Dein Abo (Bestellung {b['bestellnr']}) endet zum {ortsdatum(ende) or 'Ende des Abrechnungszeitraums'}. "
                                      f"Bis dahin bleibt dein Zugang bestehen.")
                except (VoruebergehenderFehler, Klaerung) as e:
                    log.error("Kündigung %s: Stripe fehlgeschlagen: %s", kid, e)
                    manuell = True
                    ergebnisse.append(f"Deine Kündigung für Bestellung {b['bestellnr']} ist eingegangen; das genaue "
                                      f"Vertragsende bestätigen wir dir gesondert.")
        ergebnis_text = " ".join(ergebnisse)
        con.execute("UPDATE kauf_kuendigungen SET ergebnis = ? WHERE id = ?", (ergebnis_text, kid))

        text = ("Hallo,\n\nhiermit bestätigen wir den Eingang deiner Kündigung.\n\nDeine Kündigungserklärung\n"
                + "".join(f"  {k}: {v}\n" for k, v in erklaerung)
                + f"\n{ergebnis_text}\n\nAbgegeben über die Schaltfläche „Jetzt kündigen“ auf "
                  f"{w.cfg('SITE_URL').rstrip('/')}/vertraege-kuendigen.html.\n"
                  "Falls du das nicht warst, antworte bitte auf diese Mail.\n" + gruss())
        gesendet = False
        if w.smtp_eingerichtet():
            try:
                w.mail_senden(email, "Eingangsbestätigung deiner Kündigung", text)
                gesendet = True
            except Exception:
                log.exception("Kündigungsbestätigung %s nicht verschickt", kid)
        con.execute("UPDATE kauf_kuendigungen SET bestaetigung_gesendet = ? WHERE id = ?", (int(gesendet), kid))
    log.info("Kündigung %s eingegangen (manuell=%s, Bestätigung=%s)", kid, manuell, gesendet)
    admin_melden(f"Kündigung eingegangen{' – bitte bearbeiten' if manuell or not gesendet else ''} (Nr. {kid})",
                 "".join(f"{k}: {v}\n" for k, v in erklaerung) + f"\nErgebnis: {ergebnis_text}\n"
                 f"Bestätigungsmail: {'verschickt' if gesendet else 'NICHT verschickt, bitte selbst bestätigen'}\n")

    e = html.escape
    zeilen = "".join(f"<tr><th>{e(k)}</th><td>{e(v)}</td></tr>" for k, v in erklaerung)
    mailhinweis = ("Eine Bestätigung haben wir dir soeben an " + e(email) + " geschickt." if gesendet else
                   "Die Bestätigungsmail konnte gerade nicht verschickt werden; wir holen das nach. Bitte speichere "
                   "diese Seite.")
    return w.seite("Kündigung eingegangen", f"""<style>.erkl{{width:100%;border-collapse:collapse;margin:18px 0;
font-size:15.5px}}.erkl th,.erkl td{{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid
var(--line)}}.erkl th{{width:38%;color:var(--text-soft);font-weight:600}}</style>
<p>Deine Kündigung ist bei uns eingegangen. {e(ergebnis_text)}</p>
<table class="erkl">{zeilen}</table>
<p>{mailhinweis}</p>
<p>Du kannst diese Seite mit Datum und Uhrzeit speichern oder drucken:
<button type="button" class="btn btn--ghost" onclick="window.print()">Seite drucken</button></p>""")


# --------------------------------------------------------------------------- Verwaltung

def cli(befehl: str, rest: list[str]) -> int:
    with closing(db()) as con:
        aufraeumen(con)
        if befehl == "kauf-liste":
            for r in con.execute("SELECT * FROM kauf_bestellungen ORDER BY id DESC LIMIT 100"):
                print(f"{r['bestellnr']}  {r['produkt']:<18} {r['status']:<19} {w.iso(r['angelegt_am'])}  "
                      f"{r['email'] or '-'}  moodle={r['moodle_username'] or '-'}  {r['notiz'] or ''}")
            return 0
        if befehl == "kauf-kuendigungen":
            for r in con.execute("SELECT * FROM kauf_kuendigungen ORDER BY id DESC LIMIT 100"):
                print(f"{r['id']:>4}  {w.iso(r['eingegangen_am'])}  {r['email']}  {r['art']}/{r['zeitpunkt']}  "
                      f"Mail={'ja' if r['bestaetigung_gesendet'] else 'NEIN'}  {r['ergebnis'] or ''}")
            return 0
        if befehl == "kauf-pruefen":
            return pruefen()
        if befehl == "kauf-nachholen" and len(rest) == 1:
            return nachholen(con, rest[0])
    print("Aufruf: websiteapi.py kauf-pruefen | kauf-liste | kauf-kuendigungen | kauf-nachholen BESTELLNR")
    return 2


def nachholen(con: sqlite3.Connection, nr: str) -> int:
    """Freischaltung erneut versuchen, z. B. nach einer Klärung (holt die Checkout-Sitzung neu von Stripe)."""
    b = bestellung(con, "bestellnr", nr)
    if b is None or not b["stripe_session"]:
        print("Bestellung oder Checkout-Sitzung unbekannt")
        return 1
    if b["status"] not in ("klaerung", "zahlung_ausstehend", "offen"):
        print(f"Status ist {b['status']}, nichts nachzuholen")
        return 1
    bestellung_setzen(con, nr, status="offen")
    try:
        print(checkout_fertig(con, stripe_anfrage("GET", f"/v1/checkout/sessions/{b['stripe_session']}")))
        return 0
    except (VoruebergehenderFehler, Klaerung) as e:
        bestellung_setzen(con, nr, status="klaerung", notiz=str(e)[:500])
        print("Fehler:", e)
        return 1


def pruefen() -> int:
    """Prüft Einstellungen, Moodle-Zugang und Stripe-Preise (ändert nichts)."""
    ok = True
    print("Einstellungen:", json.dumps(status()))
    key = os.environ.get("STRIPE_SECRET_KEY", "")
    print("Stripe-Modus:", "TEST" if key.startswith(("sk_test_", "rk_test_")) else "LIVE" if key else "kein Schlüssel")
    try:
        info = moodle_aufruf("core_webservice_get_site_info")
        funktionen = sorted(f["name"] for f in info.get("functions", []))
        print("Moodle:", info.get("sitename"), "| Konto:", info.get("username"))
        print("  Funktionen:", ", ".join(funktionen))
        print("  Austragen bei Erstattung:", "freigegeben" if "enrol_manual_unenrol_users" in funktionen
              else "nicht freigegeben (Mail an Verwaltung)", "| Schalter:", schalter("KURSSHOP_AUSTRAGEN", standard=True))
    except Exception as e:
        ok = False
        print("Moodle: FEHLER", e)
    for key_, p in produkte().items():
        zeile = f"{key_}: {preis_text(p)}"
        pid = preis_id(p)
        if p["art"] == "abo":
            zeile += f" | Kohorte {p['moodle_kohorte']} id={kohorte_id(p) or 'FEHLT'}"
            ok = ok and kohorte_id(p) is not None
        if not p.get("sichtbar", True):
            zeile += " | ausgeblendet (sichtbar: false)"
        if not pid:
            print(zeile, f"| {p['stripe_preis_env']} FEHLT")
            ok = ok and not p.get("sichtbar", True)
            continue
        try:
            passt = preis_passt(p, stripe_preis(pid))
            print(zeile, f"| Stripe-Preis {'passt' if passt else 'PASST NICHT'}")
            ok = ok and bool(passt)
        except Exception as e:
            ok = False
            print(zeile, "| Stripe: FEHLER", e)
    return 0 if ok else 1
