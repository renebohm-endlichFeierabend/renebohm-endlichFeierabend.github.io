#!/usr/bin/env bash
# Verwaltung des Website-Backends als Benutzer website (gleiche Sandbox wie der Dienst):
#   web.sh zaehlen                 Einträge je Liste und Status
#   web.sh export warteliste       bestätigte Adressen als CSV (mit Abmeldelink je Adresse)
#   web.sh loeschen ADRESSE        Adresse aus allen Listen löschen (Auskunft/Löschung nach DSGVO)
#   web.sh testmail ADRESSE        Mailversand prüfen
set -euo pipefail
exec systemd-run --wait --pipe --collect --quiet \
    -p User=website -p Group=website -p EnvironmentFile=/etc/website/website.env \
    -p NoNewPrivileges=yes -p PrivateTmp=yes -p ProtectSystem=strict -p ProtectHome=yes \
    -p ReadWritePaths=/var/lib/website \
    -p InaccessiblePaths="-/var/lib/lerncoach -/etc/lerncoach -/var/backups/lerncoach -/opt/lerncoach" \
    /opt/website-venv/bin/python /opt/website/server/websiteapi.py "$@"
