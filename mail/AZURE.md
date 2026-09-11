# Azure-Einrichtung für die Schulpost-App

Einmalige Arbeit an der **bestehenden** App-Registrierung von Lehrer-KI. Es wird
keine neue Registrierung angelegt und **kein Secret** erzeugt.

Zwei Dinge sind zu tun:

1. In Azure eine Redirect-URI vom Typ *Single-page application* ergänzen.
2. In der App Client-ID und Authority eintragen.

Nur wer freigegebene Postfächer nutzen will, braucht zusätzlich Schritt 1c.

> Die Beschriftungen im Entra-Portal ändern sich gelegentlich. Die Menüpfade unten
> stimmen mit dem Stand 09/2026; wenn ein Label abweicht, ist der gesuchte Punkt
> jeweils der inhaltlich gleiche.

---

## Schritt 1 · Azure

### 1a. Registrierung öffnen

1. https://entra.microsoft.com öffnen, mit **bohm@lfsm.de** anmelden.
   (Alternativ portal.azure.com → *Microsoft Entra ID*.)
2. Links **Anwendungen → App-Registrierungen**.
3. Falls die Registrierung nicht in der Liste steht: Reiter **Alle Anwendungen**
   statt *Eigene Anwendungen*.
4. Die Registrierung anklicken, die du für Lehrer-KI angelegt hast.

Auf der Seite **Übersicht** stehen die zwei Werte, die du später brauchst:

| Feld in Azure | wofür in der App |
|---|---|
| **Anwendungs-ID (Client)** | Feld „Application (client) ID" |
| **Verzeichnis-ID (Mandant)** | nur falls du die Authority auf den Tenant festnageln willst |

Beide sind **öffentliche Kennungen**, keine Geheimnisse — sie dürfen kopiert und
notiert werden.

### 1b. Redirect-URI ergänzen (Pflicht)

1. Im linken Menü der Registrierung: **Authentifizierung**.
2. **Plattform hinzufügen** klicken.
3. **Einzelseitige Anwendung** wählen — englisch *Single-page application*.
   **Nicht** „Web", **nicht** „Mobile und Desktopanwendungen".
4. Als Umleitungs-URI **genau** das eintragen, mit Schrägstrich am Ende:

   ```
   https://renebohm-endlichfeierabend.github.io/mail/
   ```

5. **Konfigurieren** klicken.

**Wo genau das steht.** Die Seite *Authentifizierung* führt mehrere getrennte Listen
untereinander, eine je Plattform. Für Lehrer-KI liegt `http://localhost` unter
**Mobile Geräte und Desktopanwendungen** — das ist eine **andere Liste** als die, die
eine Web-App braucht. Gesucht ist ein eigener Abschnitt **Einzelseitige Anwendung**
(englisch *Single-page application*). Fehlt er noch, entsteht er erst durch
*Plattform hinzufügen*; danach steht er als eigener Block auf derselben Seite.

**Falls „Plattform hinzufügen" nicht auffindbar ist**, geht es auch über das
Manifest — links im Menü **Manifest**. Je nach Portalversion siehst du eines von
beidem; ergänze nur die Zeile mit der URI und speichere:

```jsonc
// neueres Format (Microsoft-Graph-App-Manifest)
"spa": { "redirectUris": [ "https://renebohm-endlichfeierabend.github.io/mail/" ] }

// älteres Format (AAD-Graph-Manifest)
"replyUrlsWithType": [
  { "url": "http://localhost", "type": "InstalledClient" },
  { "url": "https://renebohm-endlichfeierabend.github.io/mail/", "type": "Spa" }
]
```

Im älteren Format ist `"type": "Spa"` das Entscheidende — mit `InstalledClient`
oder `Web` scheitert die Anmeldung, obwohl die Adresse dasteht.

Wichtig dabei:

- **Keine** der Haken bei „Implizite Genehmigung" (Zugriffstoken / ID-Token) setzen.
  PKCE braucht sie nicht, und sie machen die Registrierung unnötig angreifbar.
- Der Plattformtyp ist keine Formalie: nur für *Single-page application* gibt Entra ID
  Tokens per CORS an einen Browser heraus. Bei Typ „Web" bricht die Anmeldung ab.
- Die bestehende `http://localhost`-URI der Desktop-App bleibt daneben stehen.
  Nichts davon löschen.
- **Allow public client flows / Öffentliche Clientflows zulassen** unter
  *Erweiterte Einstellungen* auf **Ja** lassen — das braucht die Desktop-App.

### 1c. Scopes für freigegebene Postfächer (nur bei Bedarf)

Für das eigene Postfach ist nichts zu tun: `User.Read`, `Mail.ReadWrite` und
`Mail.Send` hat die Registrierung schon.

Für fremde Postfächer:

1. Linkes Menü: **API-Berechtigungen**.
2. **Berechtigung hinzufügen → Microsoft Graph → Delegierte Berechtigungen**.
3. Suchen und anhaken:
   - `Mail.ReadWrite.Shared`
   - `Mail.Send.Shared`
4. **Berechtigungen hinzufügen**.

Danach in der Spalte **Status** nachsehen:

- Leer oder ein Haken → passt, deine eigene Zustimmung beim ersten Login genügt.
- **„Nicht erteilt"** in Rot und der Knopf *Administratorzustimmung erteilen* ist
  ausgegraut → dein Tenant verlangt Admin-Consent, und du bist nicht Admin. Dann
  muss die Schul-IT einmal auf diesen Knopf drücken. Ohne das bleiben die
  freigegebenen Postfächer gesperrt; das eigene funktioniert trotzdem.

**Zweite, unabhängige Hürde:** Graph-Scopes sind nicht dasselbe wie
Exchange-Delegation. Selbst mit `Mail.Send.Shared` liefert Graph einen 403, wenn
dein Konto auf dem Postfach keine echte Freigabe hat (Vollzugriff bzw. „Senden
als" / „Senden im Auftrag von"). Das wird in Exchange am Postfach eingestellt,
nicht in der App-Registrierung.

---

## Schritt 2 · In der App eintragen

1. https://renebohm-endlichfeierabend.github.io/mail/ öffnen.
2. Der Einrichtungsbildschirm zeigt oben die Redirect-URI, die in Azure stehen
   muss — zum Abgleich, mit Kopierknopf.
3. Eintragen:

   | Feld | Wert |
   |---|---|
   | Application (client) ID | die **Anwendungs-ID (Client)** aus Azure |
   | Authority | `https://login.microsoftonline.com/organizations` |

   Statt `organizations` geht auch `https://login.microsoftonline.com/<Verzeichnis-ID>`.
   Nötig ist das, wenn die Registrierung **auf einen Tenant beschränkt** ist und die
   Anmeldung mit `organizations` fehlschlägt.

4. Haken **Freigegebene Postfächer nutzen** nur setzen, wenn Schritt 1c erledigt
   ist. Sonst fordert die App Scopes an, die es nicht gibt, und der Login scheitert.
5. **Speichern und anmelden**.
6. Microsoft zeigt einmalig eine Zustimmungsseite mit der Liste der Berechtigungen
   → annehmen.
7. Danach über das Zahnrad → **Freigegebene Postfächer** die Adressen hinzufügen.

Beides liegt im `localStorage` dieses Geräts. Auf einem zweiten Gerät ist es
erneut einzutragen — es steht bewusst nicht im Repo.

### Auf den Homescreen legen

- Android/Chrome: Menü ⋮ → *Zum Startbildschirm hinzufügen*
- iOS/Safari: Teilen → *Zum Home-Bildschirm*

---

## Wenn es klemmt

| Meldung | Ursache | Abhilfe |
|---|---|---|
| `AADSTS50011` / „Umleitungs-URI stimmt nicht überein" | Die Zeichenkette steht in **keiner** Liste dieser Registrierung: sie fehlt, hat einen Tippfehler, der Schrägstrich am Ende fehlt — oder sie landete in einer anderen App | Schritt 1b, Zeichen für Zeichen. Die Fehlermeldung nennt die App-ID: prüfen, ob das die Registrierung ist, die du bearbeitet hast. Alternativ die in Azure vorhandene Schreibweise in den App-Einstellungen unter **Redirect-URI** eintragen |
| Login lädt, bricht dann mit CORS- oder „cross-origin token redemption"-Fehler ab | Plattformtyp ist „Web" statt *Single-page application* | in Azure die Web-Plattform entfernen, als SPA neu anlegen |
| `AADSTS65001` „keine Zustimmung" | Zustimmung nie gegeben oder Admin-Consent nötig | erneut anmelden und annehmen; sonst Schul-IT |
| `AADSTS700016` „Anwendung nicht gefunden" | Registrierung ist auf einen anderen Tenant beschränkt | Authority auf `https://login.microsoftonline.com/<Verzeichnis-ID>` setzen |
| Eigenes Postfach geht, fremdes liefert 403 | `*.Shared`-Scope fehlt **oder** keine Exchange-Delegation | Schritt 1c samt Hinweis zur Delegation |
| „Anmeldung abgebrochen oder Popup blockiert" | Popup-Modus auf dem Handy | Einstellungen → Anmeldeart **Weiterleitung** |

Die App nennt in allen diesen Fällen die Ursache im Klartext statt nur „Fehler" —
sie zeigt also selbst, welche Zeile dieser Tabelle gilt.
