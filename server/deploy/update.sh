#!/usr/bin/env bash
# Neuen Stand holen, bauen, Backend neu starten (als root).
set -euo pipefail
REPO=/opt/website
[[ $EUID -eq 0 ]] || { echo "Bitte als root ausführen." >&2; exit 1; }
DOMAIN="$(sed -n 's|^SITE_URL=https://||p' /etc/website/website.env)"

systemctl start website-backup.service
git -C "$REPO" pull --ff-only -q
git -C "$REPO" log --oneline -1
/opt/website-venv/bin/pip install -q -r "$REPO/server/requirements.txt"
install -m 644 "$REPO/server/deploy/website-api.service" "$REPO/server/deploy/website-backup.service" \
    "$REPO/server/deploy/website-backup.timer" /etc/systemd/system/
systemctl daemon-reload
bash "$REPO/server/deploy/bauen.sh"
bash "$REPO/server/deploy/caddy-einbinden.sh" "$DOMAIN"
systemctl restart website-api.service
for _ in $(seq 1 20); do curl -fsS http://127.0.0.1:8100/api/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:8100/api/health && echo
