# Lehrer-Tool – Setup-Anleitung

## Google Drive Sync einrichten

### 1. Google Cloud Projekt anlegen

1. Gehe zu https://console.cloud.google.com/
2. Klicke oben auf das Projekt-Dropdown → **Neues Projekt**
3. Name: `Lehrer-Tool` → **Erstellen**
4. Wechsle in das neue Projekt

### 2. Google Drive API aktivieren

1. Im linken Menü: **APIs & Dienste → Bibliothek**
2. Suche nach **Google Drive API** → Klicke darauf → **Aktivieren**

### 3. OAuth-Zustimmungsbildschirm konfigurieren

1. **APIs & Dienste → OAuth-Zustimmungsbildschirm**
2. Nutzertyp: **Extern** → **Erstellen**
3. App-Name: `Lehrer-Tool`
4. Support-E-Mail: deine E-Mail-Adresse
5. Entwickler-Kontakt: deine E-Mail-Adresse
6. **Speichern und fortfahren**
7. Bei **Scopes**: Klicke **Scopes hinzufügen oder entfernen**
   - Suche nach `drive.file`
   - Aktiviere `https://www.googleapis.com/auth/drive.file`
   - Klicke **Aktualisieren**
8. **Speichern und fortfahren**
9. Bei **Testbenutzer**: Klicke **+ Add Users** → deine E-Mail-Adresse eintragen
10. **Speichern und fortfahren** → **Zurück zum Dashboard**

> Das Projekt bleibt im "Testen"-Modus – das reicht für den privaten Gebrauch völlig aus.

### 4. OAuth-Client-ID erstellen

1. **APIs & Dienste → Anmeldedaten**
2. Klicke **+ Anmeldedaten erstellen → OAuth-Client-ID**
3. Anwendungstyp: **Webanwendung**
4. Name: `Lehrer-Tool Web`
5. Bei **Autorisierte JavaScript-Quellen**:
   - Klicke **+ URI hinzufügen**
   - Trage ein: `https://tool.renebohm-endlichfeierabend.de`
   - Für lokale Tests auch: `http://localhost:5173`
6. Autorisierte Weiterleitungs-URIs: **leer lassen** (GIS nutzt keinen Redirect)
7. **Erstellen**
8. Im Pop-up erscheint deine **Client-ID** – kopiere sie (Format: `xxxxx.apps.googleusercontent.com`)

### 5. In der App verbinden

1. Öffne das Lehrer-Tool auf deinem Gerät
2. Tippe oben rechts auf das **Einstellungen-Symbol (⚙️)**
3. Füge die Client-ID ein
4. Klicke **Mit Google verbinden** → Google-Login-Pop-up erscheint
5. Dein Google-Konto autorisieren

Die Verbindung wird im Browser gespeichert. Sie muss nur einmal pro Gerät eingerichtet werden. Nach einem Token-Ablauf (~1 Stunde) musst du dich ggf. erneut verbinden.

---

## DNS-Konfiguration (einmalig)

Für die Custom Domain `tool.renebohm-endlichfeierabend.de`:

Beim DNS-Provider deiner Domain einen **CNAME-Record** anlegen:

| Typ   | Name  | Ziel                                        |
|-------|-------|---------------------------------------------|
| CNAME | tool  | renebohm-endlichfeierabend.github.io        |

Danach in den GitHub Repo-Settings:
- **Settings → Pages → Custom Domain** → `tool.renebohm-endlichfeierabend.de` eintragen
- **HTTPS erzwingen** aktivieren (nach DNS-Propagation, kann bis zu 24h dauern)

---

## Lokale Entwicklung

```bash
cd tool
npm install
npm run dev
```

App läuft auf http://localhost:5173

---

## Deployment

Wird automatisch ausgelöst durch einen Push auf `main` (wenn Dateien in `tool/` geändert wurden).
Der GitHub Actions Workflow baut die App und deployt sie auf den `gh-pages` Branch.
