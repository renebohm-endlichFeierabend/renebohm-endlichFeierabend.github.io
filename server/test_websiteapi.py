"""Ablauf Anmelden → Bestätigen → Abmelden mit Schein-Mailversand. Aufruf: python -m pytest server/  oder  python server/test_websiteapi.py"""
import os
import re
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))


def test_ablauf():
    tmp = tempfile.mkdtemp()
    os.environ.update(WEBSITE_DB=f"{tmp}/t.db", WEBSITE_SECRET="x" * 40, SITE_URL="https://beispiel.de",
                      SMTP_HOST="h", SMTP_USER="u", SMTP_PASSWORD="p", MAIL_FROM="info@beispiel.de")
    import websiteapi
    from fastapi.testclient import TestClient

    gesendet = []
    websiteapi.mail_senden = lambda an, betreff, text, abmeldelink=None: gesendet.append((an, text))
    c = TestClient(websiteapi.create_app())

    assert c.get("/api/health").json()["status"] == "ok"
    # ohne Einwilligung / ungültige Adresse / falsche Liste
    assert c.post("/api/anmelden", data={"email": "a@b.de", "liste": "warteliste"}).status_code == 400
    assert c.post("/api/anmelden", data={"email": "kaputt", "liste": "warteliste", "einwilligung": "ja"}).status_code == 400
    assert c.post("/api/anmelden", data={"email": "a@b.de", "liste": "gibtsnicht", "einwilligung": "ja"}).status_code == 400
    # Honeypot: Erfolgsseite, aber nichts gespeichert, keine Mail
    assert c.post("/api/anmelden", data={"email": "bot@b.de", "liste": "warteliste", "einwilligung": "ja",
                                         "website": "x"}).status_code == 200
    assert gesendet == []

    r = c.post("/api/anmelden", data={"email": " Max@Beispiel.DE ", "liste": "warteliste", "einwilligung": "ja"})
    assert r.status_code == 200 and len(gesendet) == 1 and gesendet[0][0] == "max@beispiel.de"
    # zweite Anmeldung sofort danach: keine zweite Mail
    c.post("/api/anmelden", data={"email": "max@beispiel.de", "liste": "warteliste", "einwilligung": "ja"})
    assert len(gesendet) == 1

    link = re.search(r"https://beispiel\.de(/api/bestaetigen\?\S+)", gesendet[0][1]).group(1)
    id_, t = re.search(r"id=(\d+)&t=([0-9a-f]+)", link).groups()
    assert c.get(link).status_code == 200                      # GET bestätigt noch nicht
    assert "offen" in _status()
    assert c.post("/api/bestaetigen", data={"id": id_, "t": "0" * 40}).status_code == 400
    r = c.post("/api/bestaetigen", data={"id": id_, "t": t})
    assert r.status_code == 200 and "bestaetigt" in _status()

    abmelde = re.search(r'href="https://beispiel\.de(/api/abmelden\?[^"]+)"', r.text).group(1).replace("&amp;", "&")
    a_id, a_t = re.search(r"id=(\d+)&t=([0-9a-f]+)", abmelde).groups()
    assert a_t != t                                            # eigener Token je Zweck
    assert c.post("/api/abmelden", data={"id": a_id, "t": t}).status_code == 200  # falscher Token: nichts gelöscht
    assert "bestaetigt" in _status()
    c.post("/api/abmelden", data={"id": a_id, "t": a_t})
    assert _status() == []

    # Begrenzung pro IP greift (5 pro 15 min, zwei Anfragen oben zählen schon)
    codes = [c.post("/api/anmelden", data={"email": f"n{i}@b.de", "liste": "warteliste", "einwilligung": "ja"}).status_code
             for i in range(5)]
    assert codes.count(429) >= 1


def _status():
    import websiteapi
    from contextlib import closing
    with closing(websiteapi.db()) as con:
        return [r[0] for r in con.execute("SELECT status FROM eintraege")]


if __name__ == "__main__":
    test_ablauf()
    print("ok")
