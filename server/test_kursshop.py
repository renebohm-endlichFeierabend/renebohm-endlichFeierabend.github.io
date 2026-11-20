"""Kursshop: Bestellen → Stripe-Webhook → Moodle, Erstattung, Kündigung. Stripe und Moodle sind nachgestellt,
es gibt keine echten Aufrufe. Aufruf: python -m pytest server/"""
import hashlib
import hmac
import json
import logging
import os
import re
import sqlite3
import sys
import time

import pytest

sys.path.insert(0, os.path.dirname(__file__))

WEBHOOK_SECRET = "whsec_nur_fuer_tests"
KOHORTE_ID = 7


class FakeMoodle:
    def __init__(self):
        self.users = {}            # id -> dict
        self.enrol = set()         # (userid, courseid)
        self.kohorte = set()       # userid
        self.aufrufe = []
        self.fehler = None         # Ausnahme, die beim nächsten Aufruf geworfen wird
        self.naechste_id = 100

    def __call__(self, funktion, **params):
        self.aufrufe.append((funktion, params))
        if self.fehler:
            f, self.fehler = self.fehler, None
            raise f
        if funktion == "core_user_get_users_by_field":
            wert = params["values"][0]
            return [u for u in self.users.values() if u[params["field"]] == wert]
        if funktion == "core_user_create_users":
            u = dict(params["users"][0], id=self.naechste_id)
            self.naechste_id += 1
            self.users[u["id"]] = u
            return [{"id": u["id"], "username": u["username"]}]
        if funktion == "enrol_manual_enrol_users":
            e = params["enrolments"][0]
            assert e["roleid"] == 5
            self.enrol.add((e["userid"], e["courseid"]))
            return None
        if funktion == "enrol_manual_unenrol_users":
            e = params["enrolments"][0]
            self.enrol.discard((e["userid"], e["courseid"]))
            return None
        if funktion == "core_cohort_add_cohort_members":
            m = params["members"][0]
            assert m["cohorttype"] == {"type": "idnumber", "value": "abo-alle-kurse"}
            self.kohorte.add(m["usertype"]["value"])
            return {"warnings": []}
        if funktion == "core_cohort_delete_cohort_members":
            m = params["members"][0]
            assert m["cohortid"] == KOHORTE_ID
            self.kohorte.discard(m["userid"])
            return None
        raise AssertionError(f"unerwartete Moodle-Funktion {funktion}")


class FakeStripe:
    def __init__(self):
        self.aufrufe = []

    def __call__(self, methode, pfad, daten=None, idempotenz=None):
        self.aufrufe.append((methode, pfad, daten, idempotenz))
        if methode == "GET" and pfad.startswith("/v1/prices/"):
            pid = pfad.rsplit("/", 1)[1]
            abo = pid == "price_abo"
            return {"id": pid, "active": True, "currency": "eur", "unit_amount": 499 if abo else 2900,
                    "type": "recurring" if abo else "one_time"}
        if methode == "POST" and pfad == "/v1/checkout/sessions":
            return {"id": f"cs_test_{len(self.aufrufe)}", "url": "https://checkout.stripe.com/c/pay/cs_test"}
        if methode == "POST" and pfad.startswith("/v1/subscriptions/"):
            return {"id": pfad.rsplit("/", 1)[1], "cancel_at_period_end": True,
                    "items": {"data": [{"current_period_end": 1798761600}]}}
        raise AssertionError(f"unerwarteter Stripe-Aufruf {methode} {pfad}")


@pytest.fixture
def shop(tmp_path, monkeypatch):
    monkeypatch.setenv("WEBSITE_DB", str(tmp_path / "t.db"))
    for k, v in dict(WEBSITE_SECRET="x" * 40, SITE_URL="https://beispiel.de", SMTP_HOST="h", SMTP_USER="u",
                     SMTP_PASSWORD="p", MAIL_FROM="info@beispiel.de", KURSSHOP_AKTIV="1",
                     STRIPE_SECRET_KEY="sk_test_platzhalter", STRIPE_WEBHOOK_SECRET=WEBHOOK_SECRET,
                     MOODLE_KURSSHOP_TOKEN="platzhalter", STRIPE_PRICE_BEISPIEL_BEZAHLT="price_einzel",
                     STRIPE_PRICE_ABO_ALLE_KURSE="price_abo", MOODLE_ABO_KOHORTE_ID=str(KOHORTE_ID),
                     KURSSHOP_ADMIN_MAIL="verwaltung@beispiel.de").items():
        monkeypatch.setenv(k, v)
    for k in ("KURSSHOP_AUSTRAGEN", "MOODLE_CREATEPASSWORD", "STRIPE_PORTAL_LOGIN_URL"):
        monkeypatch.delenv(k, raising=False)
    import websiteapi
    import kursshop
    from fastapi.testclient import TestClient

    mails = []
    monkeypatch.setattr(websiteapi, "mail_senden",
                        lambda an, betreff, text, abmeldelink=None: mails.append((an, betreff, text)))
    moodle, stripe = FakeMoodle(), FakeStripe()
    monkeypatch.setattr(kursshop, "moodle_aufruf", moodle)
    monkeypatch.setattr(kursshop, "stripe_anfrage", stripe)
    kursshop._preis_cache.clear()

    class S:
        pass
    s = S()
    s.c, s.mails, s.moodle, s.stripe, s.k, s.db = TestClient(websiteapi.create_app()), mails, moodle, stripe, kursshop, tmp_path / "t.db"
    s.kunde = lambda: [m for m in mails if m[0] != "verwaltung@beispiel.de"]
    s.admin = lambda: [m for m in mails if m[0] == "verwaltung@beispiel.de"]
    return s


def senden(s, event, secret=WEBHOOK_SECRET, t=None):
    roh = json.dumps(event).encode()
    t = int(time.time()) if t is None else t
    sig = hmac.new(secret.encode(), f"{t}.".encode() + roh, hashlib.sha256).hexdigest()
    return s.c.post("/api/kauf/stripe", content=roh, headers={"Stripe-Signature": f"t={t},v1={sig}",
                                                               "Content-Type": "application/json"})


def bestellen(s, produkt="beispiel-bezahlt"):
    r = s.c.post("/api/kauf/bestellen", data={"produkt": produkt, "widerruf": "ja", "wohnsitz": "ja"},
                 follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].startswith("https://checkout.stripe.com/")
    daten = s.stripe.aufrufe[-1][2]
    return daten["metadata"]["bestellnr"], daten


def checkout_event(nr, daten, eid="evt_1", email="max@beispiel.de", land="DE", paid="paid"):
    abo = daten["mode"] == "subscription"
    return {"id": eid, "type": "checkout.session.completed", "data": {"object": {
        "id": "cs_test_x" + eid, "object": "checkout.session", "mode": daten["mode"], "payment_status": paid,
        "client_reference_id": nr, "metadata": daten["metadata"], "amount_total": 499 if abo else 2900,
        "customer": "cus_1", "subscription": "sub_1" if abo else None, "payment_intent": None if abo else "pi_1",
        "customer_details": {"email": email, "name": "Max Mustermann", "address": {"country": land}}}}}


def zeilen(s, sql):
    with sqlite3.connect(s.db) as con:
        con.row_factory = sqlite3.Row
        return con.execute(sql).fetchall()


# --------------------------------------------------------------------------- Bestellseite

def test_bestellseite_und_checkout(shop):
    r = shop.c.get("/api/kauf/bestellen?produkt=beispiel-bezahlt")
    assert r.status_code == 200 and "Zahlungspflichtig bestellen" in r.text and "29,00 €" in r.text
    assert "§ 19 Abs. 1 UStG" in r.text and 'name="widerruf"' in r.text
    assert shop.c.get("/api/kauf/bestellen?produkt=gibtsnicht").status_code == 404
    # ohne Häkchen keine Weiterleitung, keine Bestellung
    r = shop.c.post("/api/kauf/bestellen", data={"produkt": "beispiel-bezahlt", "wohnsitz": "ja"}, follow_redirects=False)
    assert r.status_code == 400 and zeilen(shop, "SELECT * FROM kauf_bestellungen") == []

    nr, daten = bestellen(shop)
    assert re.fullmatch(r"EF-\d{8}-[0-9A-F]{8}", nr)
    assert daten["mode"] == "payment" and daten["locale"] == "de" and daten["client_reference_id"] == nr
    assert daten["invoice_creation"]["invoice_data"]["footer"] == "Nach § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet."
    assert daten["metadata"]["widerruf_version"] and int(daten["metadata"]["widerruf_zustimmung_ts"]) > 0
    assert daten["billing_address_collection"] == "required"
    assert shop.stripe.aufrufe[-1][3] == f"checkout-{nr}"  # Idempotency-Key
    (b,) = zeilen(shop, "SELECT * FROM kauf_bestellungen")
    assert b["status"] == "offen" and b["email"] is None and b["widerruf_zustimmung_am"] > 0
    assert "Widerrufsrecht verliere" in b["widerruf_text"]

    _, abo = bestellen(shop, "abo-alle-kurse")
    assert abo["mode"] == "subscription" and "invoice_creation" not in abo
    assert abo["subscription_data"]["metadata"]["bestellnr"]


def test_shop_geschlossen_und_falscher_preis(shop, monkeypatch):
    monkeypatch.setenv("KURSSHOP_AKTIV", "0")
    assert shop.c.get("/api/kauf/bestellen?produkt=beispiel-bezahlt").status_code == 503
    monkeypatch.setenv("KURSSHOP_AKTIV", "1")
    monkeypatch.setenv("STRIPE_PRICE_BEISPIEL_BEZAHLT", "price_abo")  # Abo-Preis an Einzelkurs: passt nicht
    r = shop.c.post("/api/kauf/bestellen", data={"produkt": "beispiel-bezahlt", "widerruf": "ja", "wohnsitz": "ja"},
                    follow_redirects=False)
    assert r.status_code == 503 and zeilen(shop, "SELECT * FROM kauf_bestellungen") == []


# --------------------------------------------------------------------------- Signatur

def test_signatur(shop):
    k = shop.k
    roh = b'{"id":"evt_x"}'
    t = 1_700_000_000
    sig = hmac.new(b"geheim", f"{t}.".encode() + roh, hashlib.sha256).hexdigest()
    assert k.signatur_ok(roh, f"t={t},v1={sig}", "geheim", jetzt_s=t + 10)
    assert k.signatur_ok(roh, f"t={t},v1=abc,v1={sig},v0=egal", "geheim", jetzt_s=t)  # mehrere v1 (Schlüsselwechsel)
    assert not k.signatur_ok(roh, f"t={t},v1={sig}", "geheim", jetzt_s=t + 301)       # zu alt
    assert not k.signatur_ok(roh + b" ", f"t={t},v1={sig}", "geheim", jetzt_s=t)       # Inhalt verändert
    assert not k.signatur_ok(roh, f"t={t},v1={sig}", "anders", jetzt_s=t)
    assert not k.signatur_ok(roh, "", "geheim") and not k.signatur_ok(roh, "t=abc,v1=00", "geheim")

    ev = {"id": "evt_sig", "type": "invoice.paid", "data": {"object": {}}}
    assert senden(shop, ev, secret="whsec_falsch").status_code == 400
    assert senden(shop, ev, t=int(time.time()) - 3600).status_code == 400
    assert shop.c.post("/api/kauf/stripe", content=b"{}").status_code == 400
    assert senden(shop, ev).status_code == 200


def test_webhook_ohne_secret(shop, monkeypatch):
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET")
    assert senden(shop, {"id": "evt_1", "type": "x", "data": {}}).status_code == 503


# --------------------------------------------------------------------------- Einzelkurs

def test_einzelkurs_neues_konto_idempotent(shop, caplog):
    caplog.set_level(logging.DEBUG)
    nr, daten = bestellen(shop)
    ev = checkout_event(nr, daten, email="Max@Beispiel.de")
    r = senden(shop, ev)
    assert r.status_code == 200 and r.json()["ergebnis"] == "freigeschaltet"

    (u,) = shop.moodle.users.values()
    assert u["email"] == "max@beispiel.de" and u["username"] == "max@beispiel.de"
    assert u["firstname"] == "Max" and u["lastname"] == "Mustermann" and "createpassword" not in u
    assert u["preferences"] == [{"type": "auth_forcepasswordchange", "value": "1"}]
    pw = u["password"]
    assert len(pw) == 16 and re.search(r"[A-Z]", pw) and re.search(r"[a-z]", pw) and re.search(r"\d", pw) \
        and re.search(r"[^A-Za-z0-9]", pw)
    assert shop.moodle.enrol == {(u["id"], 31)}

    (kunde,) = shop.kunde()
    assert kunde[0] == "max@beispiel.de" and nr in kunde[1]
    text = kunde[2]
    assert pw in text and "Benutzername:  max@beispiel.de" in text and "/login/index.php" in text
    assert "course/view.php?id=31" in text and "Fragen & Antworten" in text and "Zeig dein Ergebnis" in text
    assert "Widerrufsrecht" in text and "§ 19 Abs. 1 UStG" in text
    # Passwort nie im Log, nie in der Datenbank
    assert pw not in caplog.text
    with open(shop.db, "rb") as f:
        assert pw.encode() not in f.read()
    assert all(pw not in str(tuple(z)) for t in ("kauf_bestellungen", "kauf_ereignisse")
               for z in zeilen(shop, f"SELECT * FROM {t}"))
    (b,) = zeilen(shop, "SELECT * FROM kauf_bestellungen")
    assert b["status"] == "aktiv" and b["moodle_userid"] == u["id"] and b["stripe_payment_intent"] == "pi_1"
    assert b["zugang_mail_am"] and b["land"] == "DE"

    # dasselbe Ereignis erneut: nichts passiert
    n_moodle, n_mails = len(shop.moodle.aufrufe), len(shop.mails)
    assert senden(shop, ev).json()["status"] == "schon verarbeitet"
    # anderes Ereignis zur selben Bestellung (z. B. async_payment_succeeded): auch nichts
    ev2 = dict(ev, id="evt_2", type="checkout.session.async_payment_succeeded")
    assert "schon bearbeitet" in senden(shop, ev2).json()["ergebnis"]
    assert len(shop.moodle.aufrufe) == n_moodle and len(shop.mails) == n_mails


def test_einzelkurs_vorhandenes_konto(shop):
    shop.moodle.users[5] = {"id": 5, "username": "erika", "email": "erika@beispiel.de"}
    nr, daten = bestellen(shop)
    assert senden(shop, checkout_event(nr, daten, email="erika@beispiel.de")).status_code == 200
    assert not any(f == "core_user_create_users" for f, _ in shop.moodle.aufrufe)
    assert shop.moodle.enrol == {(5, 31)}
    text = shop.kunde()[0][2]
    assert "schon ein Konto" in text and "erika" in text and "Startpasswort" not in text


def test_createpassword_schalter(shop, monkeypatch):
    monkeypatch.setenv("MOODLE_CREATEPASSWORD", "1")
    nr, daten = bestellen(shop)
    senden(shop, checkout_event(nr, daten))
    (u,) = shop.moodle.users.values()
    assert u["createpassword"] == 1 and "password" not in u and "preferences" not in u
    assert "Startpasswort" not in shop.kunde()[0][2]


def test_moodle_nicht_erreichbar_wird_wiederholt(shop):
    nr, daten = bestellen(shop)
    ev = checkout_event(nr, daten)
    shop.moodle.fehler = shop.k.VoruebergehenderFehler("Moodle weg")
    assert senden(shop, ev).status_code == 503
    assert shop.kunde() == []
    assert senden(shop, ev).status_code == 200  # Stripe wiederholt
    assert len(shop.moodle.enrol) == 1 and len(shop.kunde()) == 1
    (e,) = zeilen(shop, "SELECT * FROM kauf_ereignisse")
    assert e["erledigt"] == 1 and e["versuche"] == 2


def test_ohne_smtp_keine_freischaltung(shop, monkeypatch):
    nr, daten = bestellen(shop)
    monkeypatch.setenv("SMTP_PASSWORD", "")
    assert senden(shop, checkout_event(nr, daten)).status_code == 503
    assert shop.moodle.users == {}


def test_ausstehende_zahlung_und_ausland(shop):
    nr, daten = bestellen(shop)
    assert senden(shop, checkout_event(nr, daten, paid="unpaid")).json()["ergebnis"] == "wartet auf Zahlungseingang"
    assert shop.moodle.enrol == set()
    ev = checkout_event(nr, daten, eid="evt_2", land="AT")
    ev["type"] = "checkout.session.async_payment_succeeded"
    assert senden(shop, ev).json()["ergebnis"] == "freigeschaltet"
    assert any("außerhalb Deutschlands" in m[1] for m in shop.admin())


def test_fremde_sitzung_ignoriert(shop):
    ev = {"id": "evt_f", "type": "checkout.session.completed", "data": {"object": {"metadata": {}}}}
    assert "ignoriert" in senden(shop, ev).json()["ergebnis"]


def test_erstattung_einzelkurs(shop, monkeypatch):
    nr, daten = bestellen(shop)
    senden(shop, checkout_event(nr, daten))
    charge = {"id": "ch_1", "object": "charge", "payment_intent": "pi_1", "customer": "cus_1", "refunded": True,
              "amount_refunded": 2900}
    # Schalter aus: nicht austragen, Mail an Verwaltung
    r = senden(shop, {"id": "evt_r1", "type": "charge.refunded", "data": {"object": charge}})
    assert r.status_code == 200 and len(shop.moodle.enrol) == 1
    assert not any(f == "enrol_manual_unenrol_users" for f, _ in shop.moodle.aufrufe)
    assert any("Bitte austragen" in m[1] and "user/index.php?id=31" in m[2] for m in shop.admin())
    assert zeilen(shop, "SELECT status FROM kauf_bestellungen")[0][0] == "erstattet"


def test_erstattung_mit_schalter_und_dispute(shop, monkeypatch):
    monkeypatch.setenv("KURSSHOP_AUSTRAGEN", "1")
    nr, daten = bestellen(shop)
    senden(shop, checkout_event(nr, daten))
    dispute = {"id": "dp_1", "object": "dispute", "charge": "ch_1", "payment_intent": "pi_1"}
    assert senden(shop, {"id": "evt_d", "type": "charge.dispute.created", "data": {"object": dispute}}).status_code == 200
    assert shop.moodle.enrol == set()
    # Teilerstattung: nur melden
    nr2, daten2 = bestellen(shop)
    ev = checkout_event(nr2, daten2, eid="evt_3")
    ev["data"]["object"]["payment_intent"] = "pi_2"
    senden(shop, ev)
    teil = {"id": "ch_2", "payment_intent": "pi_2", "refunded": False, "amount_refunded": 500}
    assert "Teilerstattung" in senden(shop, {"id": "evt_t", "type": "charge.refunded", "data": {"object": teil}}).json()["ergebnis"]
    assert len(shop.moodle.enrol) == 1


# --------------------------------------------------------------------------- Abo

def abo_kaufen(shop):
    nr, daten = bestellen(shop, "abo-alle-kurse")
    assert senden(shop, checkout_event(nr, daten, eid="evt_abo")).json()["ergebnis"] == "freigeschaltet"
    (u,) = shop.moodle.users.values()
    assert shop.moodle.kohorte == {u["id"]} and shop.moodle.enrol == set()
    return nr, u


def test_abo_ablauf(shop):
    nr, u = abo_kaufen(shop)
    assert "vertraege-kuendigen.html" in shop.kunde()[0][2]
    # erste Rechnung (kann auch vor dem Checkout kommen) und Verlängerung
    inv = {"id": "in_1", "object": "invoice", "billing_reason": "subscription_cycle",
           "parent": {"subscription_details": {"subscription": "sub_1"}},
           "lines": {"data": [{"period": {"start": 1, "end": 1798761600}}]}}
    shop.moodle.kohorte.clear()  # z. B. von Hand entfernt: Verlängerung stellt die Mitgliedschaft wieder her
    assert senden(shop, {"id": "evt_i", "type": "invoice.paid", "data": {"object": inv}}).status_code == 200
    assert shop.moodle.kohorte == {u["id"]}
    assert zeilen(shop, "SELECT bezahlt_bis FROM kauf_bestellungen")[0][0] == 1798761600
    # Kündigung im Stripe-Kundenportal (zum Periodenende), dann Ende
    sub = {"id": "sub_1", "object": "subscription", "status": "active", "cancel_at_period_end": True,
           "current_period_end": 1798761600}
    senden(shop, {"id": "evt_u", "type": "customer.subscription.updated", "data": {"object": sub}})
    assert zeilen(shop, "SELECT status FROM kauf_bestellungen")[0][0] == "gekuendigt"
    assert shop.moodle.kohorte == {u["id"]}
    sub = dict(sub, status="canceled")
    assert senden(shop, {"id": "evt_del", "type": "customer.subscription.deleted", "data": {"object": sub}}).status_code == 200
    assert shop.moodle.kohorte == set()
    assert zeilen(shop, "SELECT status FROM kauf_bestellungen")[0][0] == "beendet"


def test_abo_zahlungsausfall_und_erstattung(shop):
    nr, u = abo_kaufen(shop)
    sub = {"id": "sub_1", "status": "unpaid"}
    senden(shop, {"id": "evt_u", "type": "customer.subscription.updated", "data": {"object": sub}})
    assert shop.moodle.kohorte == set()

    shop.moodle.users.clear()
    nr2, daten = bestellen(shop, "abo-alle-kurse")
    ev = checkout_event(nr2, daten, eid="evt_abo2", email="anna@beispiel.de")
    ev["data"]["object"].update(customer="cus_2", subscription="sub_2")
    senden(shop, ev)
    (u2,) = shop.moodle.users.values()
    assert u2["id"] in shop.moodle.kohorte
    charge = {"id": "ch_9", "payment_intent": "pi_9", "customer": "cus_2", "refunded": True, "amount_refunded": 499}
    senden(shop, {"id": "evt_r", "type": "charge.refunded", "data": {"object": charge}})
    assert u2["id"] not in shop.moodle.kohorte


def test_abo_ohne_kohorten_id(shop, monkeypatch):
    nr, u = abo_kaufen(shop)
    monkeypatch.delenv("MOODLE_ABO_KOHORTE_ID")
    senden(shop, {"id": "evt_del", "type": "customer.subscription.deleted", "data": {"object": {"id": "sub_1"}}})
    assert shop.moodle.kohorte == {u["id"]}  # nicht automatisch möglich
    assert any("aus Kohorte entfernen" in m[1] for m in shop.admin())


# --------------------------------------------------------------------------- Kündigung

def kuendigung(shop, **felder):
    daten = {"name": "Max Mustermann", "email": "max@beispiel.de", "vertrag": "abo-alle-kurse",
             "art": "ordentlich", "zeitpunkt": "naechstmoeglich"}
    daten.update(felder)
    return shop.c.post("/api/kuendigen", data=daten)


def test_kuendigung_abo(shop):
    nr, u = abo_kaufen(shop)
    vorher = len(shop.kunde())
    r = kuendigung(shop)
    assert r.status_code == 200 and "Kündigung eingegangen" in r.text and "Eingegangen am" in r.text
    methode, pfad, daten, _ = shop.stripe.aufrufe[-1]
    assert (methode, pfad, daten) == ("POST", "/v1/subscriptions/sub_1", {"cancel_at_period_end": True})
    (b,) = zeilen(shop, "SELECT * FROM kauf_bestellungen")
    assert b["status"] == "gekuendigt" and b["kuendigung_zum"] == 1798761600
    (mail,) = shop.kunde()[vorher:]
    assert mail[0] == "max@beispiel.de" and "Eingangsbestätigung" in mail[1]
    assert "ordentliche Kündigung" in mail[2] and "Eingegangen am" in mail[2] and nr in mail[2]
    assert shop.moodle.kohorte == {u["id"]}  # Zugang bis zum Periodenende
    (k,) = zeilen(shop, "SELECT * FROM kauf_kuendigungen")
    assert k["bestaetigung_gesendet"] == 1 and nr in k["ergebnis"]


def test_kuendigung_unbekannt_und_ausserordentlich(shop):
    r = kuendigung(shop, email="niemand@beispiel.de")
    assert r.status_code == 200
    assert "keinen laufenden Vertrag" in shop.kunde()[-1][2]
    assert any("bitte bearbeiten" in m[1] for m in shop.admin())
    abo_kaufen(shop)
    n = len(shop.stripe.aufrufe)
    kuendigung(shop, art="ausserordentlich", grund="Umzug ins Ausland")
    assert len(shop.stripe.aufrufe) == n  # außerordentlich: von Hand
    assert "Umzug ins Ausland" in shop.kunde()[-1][2]


def test_kuendigung_eingaben(shop):
    assert kuendigung(shop, email="kaputt").status_code == 400
    assert kuendigung(shop, name="").status_code == 400
    assert kuendigung(shop, art="sofort").status_code == 400
    assert kuendigung(shop, zeitpunkt="datum", datum="2000-01-01").status_code == 400
    assert kuendigung(shop, vertrag="gibtsnicht").status_code == 400
    assert zeilen(shop, "SELECT * FROM kauf_kuendigungen") == []


# --------------------------------------------------------------------------- Statische Seiten

def test_kursseite_passt_zur_konfiguration(shop):
    wurzel = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(wurzel, "kurse", "index.html"), encoding="utf-8") as f:
        seite = f.read()
    for key, p in shop.k.produkte().items():
        assert f"/api/kauf/bestellen?produkt={key}" in seite, key
        assert shop.k.euro(p["preis_cent"]).replace(" ", "&nbsp;") in seite or shop.k.euro(p["preis_cent"]) in seite
    for frei in shop.k.konfig()["kostenlos"]:
        assert f"course/view.php?id={frei['moodle_kurs_id']}" in seite
    with open(os.path.join(wurzel, "vertraege-kuendigen.html"), encoding="utf-8") as f:
        k = f.read()
    assert 'action="/api/kuendigen"' in k and "Jetzt kündigen" in k
    for wert in shop.k.vertragsauswahl():
        assert f'value="{wert}"' in k


# --------------------------------------------------------------------------- HTTP-Schicht (lokaler Scheinserver)

def test_formular_kodierung():
    import kursshop
    paare = kursshop.formular({"line_items": [{"price": "p", "quantity": 1}], "a": {"b": True}, "leer": None})
    assert paare == [("line_items[0][price]", "p"), ("line_items[0][quantity]", "1"), ("a[b]", "true")]


def test_moodle_http(monkeypatch):
    import threading
    import urllib.parse
    from http.server import BaseHTTPRequestHandler, HTTPServer
    import kursshop

    empfangen = []

    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            daten = urllib.parse.parse_qs(self.rfile.read(int(self.headers["Content-Length"])).decode())
            empfangen.append((self.path, daten))
            antwort = ({"exception": "x", "errorcode": "invalidparameter", "message": "kaputt"}
                       if daten["wsfunction"] == ["fehler"] else [{"id": 3}])
            body = json.dumps(antwort).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        monkeypatch.setenv("MOODLE_URL", f"http://127.0.0.1:{srv.server_port}")
        monkeypatch.setenv("MOODLE_KURSSHOP_TOKEN", "tok")
        assert kursshop.moodle_aufruf("core_user_get_users_by_field", field="email", values=["a@b.de"]) == [{"id": 3}]
        pfad, daten = empfangen[0]
        assert pfad == "/webservice/rest/server.php" and daten["wstoken"] == ["tok"]
        assert daten["moodlewsrestformat"] == ["json"] and daten["values[0]"] == ["a@b.de"]
        with pytest.raises(kursshop.Klaerung, match="invalidparameter"):
            kursshop.moodle_aufruf("fehler")
    finally:
        srv.shutdown()
        srv.server_close()
    with pytest.raises(kursshop.VoruebergehenderFehler):
        kursshop.moodle_aufruf("core_webservice_get_site_info")  # Server ist weg
