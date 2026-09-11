# Schulpost — PWA für Microsoft-365-Mail

Installierbare Web-App, die Schulmail **liest, beantwortet und sendet** —
direkt gegen Microsoft Graph, ohne Zwischenserver.

Live nach dem Merge auf `main`: **https://renebohm-endlichfeierabend.github.io/mail/**

## Warum es diese App gibt

Das Feierabend-Cockpit (Claude-Artifact) kann Schulmail nur **lesen**: Ein Artifact
darf per Content-Security-Policy keinen eigenen `fetch` ausführen und kommt
ausschließlich über Connector-Tools nach außen — und der Microsoft-365-Connector
hat keine Schreib-Tools. Diese Seite läuft ohne diese Grenze.

Eine APK wäre der Umweg: eine PWA ist installierbar (Homescreen, eigenes Icon,
Vollbild), braucht keinen Store und kein Signing.

## Einrichtung

Schritt für Schritt mit Menüpfaden und Fehlertabelle: **[AZURE.md](AZURE.md)**.
Kurzfassung:

### 1. Azure: Redirect-URI ergänzen

Die App nutzt **dieselbe App-Registrierung wie Lehrer-KI**
(`Lehrer-KI/backend/graph/auth.py`) — ein Public Client mit Auth-Code-Flow + PKCE.

In der App-Registrierung unter **Authentifizierung → Plattform hinzufügen**:

- Plattformtyp: **Single-page application** (nicht „Web", nicht „Mobil")
- Redirect-URI: `https://renebohm-endlichfeierabend.github.io/mail/`

Der SPA-Typ ist Pflicht: nur dafür gibt Entra ID Tokens per CORS an einen Browser
heraus. Die bestehende `http://localhost`-URI der Desktop-App bleibt daneben stehen.

### 2. Scopes prüfen

Vorhanden sein müssen als **delegierte** Berechtigungen:

| Scope | wofür |
|---|---|
| `User.Read` | Konto anzeigen |
| `Mail.ReadWrite` | Posteingang lesen, Entwürfe anlegen |
| `Mail.Send` | senden |
| `Mail.ReadWrite.Shared` | freigegebene Postfächer lesen — nur wenn gebraucht |
| `Mail.Send.Shared` | aus freigegebenen Postfächern senden — nur wenn gebraucht |

Die ersten drei hat die Lehrer-KI-Registrierung schon. Die beiden `*.Shared`-Scopes
sind neu und müssen ergänzt werden, falls du fremde Postfächer nutzen willst.

**Offen und nicht von außen prüfbar:** ob der LFSM-Tenant die `*.Shared`-Scopes
ohne Admin-Consent zulässt. Falls nicht, meldet die App beim Zugriff einen
403 mit genau diesem Hinweis.

### 3. In der App eintragen

Beim ersten Öffnen fragt die App nach:

- **Application (client) ID** — dieselbe wie `GRAPH_CLIENT_ID` in deiner lokalen `.env`
- **Authority** — `https://login.microsoftonline.com/organizations` für einen
  Schul-Tenant, oder die konkrete Tenant-ID

Beides landet im `localStorage` des Geräts, nicht im Repo.

### 4. Auf den Homescreen legen

Android/Chrome: Menü → „Zum Startbildschirm hinzufügen".
iOS/Safari: Teilen → „Zum Home-Bildschirm".

## Kein Secret — und das ist kein Kompromiss

Ein **Public Client hat keinen Client-Secret**. Der Auth-Code-Flow mit PKCE ersetzt
ihn durch einen pro Anmeldung neu erzeugten Prüfwert, der das Gerät nie verlässt.
In den Code wandern nur Client-ID und Tenant-ID, und das sind **öffentliche
Kennungen**, keine Geheimnisse — Microsoft behandelt sie ausdrücklich so.

Ein Client-Secret in einem public Repo wäre in der Sekunde des Pushes verbrannt.
Diese App braucht deshalb keins, und es darf auch keins hinein.

Tokens liegen im MSAL-Cache (`localStorage`) und gehen an niemanden außer Microsoft.
Es gibt keinen Server von mir dazwischen.

## Funktionsumfang

- Posteingang (25 neueste), eigenes und freigegebene Postfächer
- Nachricht lesen: Textansicht oder formatiert in einem `sandbox`-iframe **ohne
  Skripte**; externe Bilder sind standardmäßig per CSP blockiert, damit
  Tracking-Pixel blind bleiben
- Antworten und Allen antworten — das Zitat des Originals bleibt erhalten
  (`createReply` → Text voranstellen → `send`)
- Neue Nachricht, jeweils auch nur als Entwurf speicherbar
- Als gelesen markieren beim Öffnen
- Optionale Entwurfshilfe über den **EF-Proxy** aus Lehrer-KI (Mistral AI,
  Frankreich). Standardmäßig aus; ohne Proxy-URL und Token erscheint der Knopf nicht.

Noch nicht drin: Anhänge, Ordner außer Posteingang, Suche, Weiterleiten.

## Übergabe aus dem Feierabend-Cockpit

Das Cockpit kann Schulmail nicht senden. Es reicht einen fertigen Entwurf hierher
weiter, per Adresszeile:

```
/mail/?reply=<messageId>&owner=<upn>&subject=<betreff>&body=<text>&alle=1
/mail/?compose=1&to=<adresse>&subject=<betreff>&body=<text>
```

`reply` öffnet die Nachricht und legt den Text ins Antwortfeld — es entsteht also
eine **echte Antwort im selben Thread** (`createReply`), keine neue Mail. `owner`
wählt ein freigegebenes Postfach, `alle=0` antwortet nur dem Absender.

Zwei Feinheiten, die leicht übersehen werden:

- Die Parameter werden **sofort beim Laden** nach `sessionStorage` gesichert und die
  Adresszeile bereinigt. Der MSAL-Redirect kehrt ohne Query zurück; ohne diesen
  Zwischenschritt wäre der Entwurf nach dem Login weg.
- Sehr lange Entwürfe passen nicht in eine URL. Das Cockpit prüft die Länge
  (Grenze 1800 Zeichen) und schickt dann nur den Bezug mit — der Text landet in der
  Zwischenablage, mit Hinweis.

## Datenschutz

Für Schulmail gilt `KI-Fortbildung/DSGVO-Richtlinie.md`. Zwei Punkte:

- Das reine Lesen und Senden läuft **ausschließlich** zwischen Gerät und Microsoft
  — kein KI-Anbieter ist beteiligt.
- Die **Entwurfshilfe** schickt den Mailtext an den EF-Proxy und von dort an
  Mistral AI in Frankreich. EU-Serverstandort ist datenschutzrechtlich deutlich
  besser als ein US-Anbieter, ersetzt aber nicht die Anonymisierung: Schülernamen
  vor dem Klick entfernen.

## Technik

- MSAL Browser **5.21.0**, als UMD-Bundle in `vendor/` mitgeliefert (kein CDN zur
  Laufzeit, funktioniert damit auch offline installiert)
- Microsoft Graph **v1.0**
- Service Worker cacht **nur** die App-Hülle. Graph, Login und Proxy werden nie
  abgefangen — solche Antworten haben in einem Cache nichts zu suchen.
- Ausgeliefert über `.github/workflows/deploy-tool.yml`, das `mail/` nach
  `deploy/mail/` kopiert. **Ohne Merge auf `main` ist die App nicht live.**

## Status

Die Graph-Endpunkte sind die dokumentierte v1.0-Oberfläche, aber **noch nicht mit
einem echten Login durchlaufen** — dafür fehlen hier Client-ID und Tenant. Der
erste echte Lauf ist deiner. Die App meldet Fehler mit Klartext samt Ursache
(fehlende Redirect-URI, fehlender Scope, fehlende Delegation), damit sich ein
Problem eingrenzen lässt, statt nur „Fehler" zu zeigen.
