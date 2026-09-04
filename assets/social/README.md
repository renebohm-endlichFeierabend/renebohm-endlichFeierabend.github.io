# assets/social

Öffentlich abrufbare JPEG-Fassungen der Instagram-Motive.

Hintergrund: Die Instagram-Content-Publishing-API – gleich ob direkt über die Graph API
(`Marketing/publish/publish_instagram.py` in KI-Fortbildung) oder über den Windsor-Connector –
lädt kein Bild hoch, sondern holt es sich von einer **öffentlich erreichbaren URL** ab.
Weil dieses Repo public ist, liefert `raw.githubusercontent.com` genau so eine URL,
ohne dass ein eigener Bild-Hoster (Cloudflare R2) eingerichtet sein muss.

Format je Datei: JPEG, 1080 × 1350 px (4:5), unter 8 MB – die Grenzen der API.

Die Dateien hier sind Ablage für den Abruf, kein Teil der Website; sie werden von
keiner Seite verlinkt.
