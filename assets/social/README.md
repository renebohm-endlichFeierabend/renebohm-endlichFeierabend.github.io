# assets/social

Öffentlich abrufbare Fassungen der Instagram-Motive: JPEG 1080 × 1350 (4:5) für Posts
und Karussells, MP4 1080 × 1920 plus Cover für Reels.

## Wozu

Die Instagram-Content-Publishing-API – gleich ob direkt über die Graph API
(`Marketing/publish/publish_instagram.py` im Repo `KI-Fortbildung`) oder über den
Windsor-Connector – lädt kein Bild hoch, sondern **holt es von einer öffentlich
erreichbaren URL ab**. Weil dieses Repo public ist, liefert `raw.githubusercontent.com`
genau so eine URL, ohne dass ein eigener Bild-Hoster (Cloudflare R2) eingerichtet sein
muss.

Angelegt werden die Dateien von `Marketing/publish/windsor_vorbereiten.py --plan`.

## Zwei Adressen, ein Ordner

`.github/workflows/deploy-tool.yml` kopiert `assets/` als Ganzes ins Deployment. Was hier
liegt, ist nach einem Merge nach `main` also **auch über die Website erreichbar**:

| Weg | Adresse | Content-Type für MP4 |
|---|---|---|
| Branch, ohne Merge | `raw.githubusercontent.com/<owner>/<repo>/refs/heads/<branch>/assets/social/…` | `application/octet-stream` (Instagram nimmt es trotzdem) |
| Website, nach Merge | `renebohm-endlichfeierabend.github.io/assets/social/…` | `video/mp4` |

Verlinkt ist der Ordner von keiner Seite, und die Motive sind ohnehin für die
Veröffentlichung auf Instagram gedacht – aber sie sind nicht privat. Nichts hier ablegen,
was nicht öffentlich sein soll.

Das kostet je Deployment die Größe des Ordners (Stand 05.09.2026: rund 11 MB). Wird das
störend, gehören ältere Motive gelöscht, sobald ihr Post veröffentlicht ist – der Kalender
hält Media-ID und Permalink fest, die Datei wird danach nicht mehr gebraucht.
