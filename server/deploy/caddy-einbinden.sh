#!/usr/bin/env bash
# Schreibt /etc/caddy/sites/website.caddy und sorgt für die import-Zeile in /etc/caddy/Caddyfile.
# Nötig, weil das setup.sh des Lerncoach /etc/caddy/Caddyfile bei jedem Lauf neu schreibt.
set -euo pipefail
DOMAIN="${1:?Aufruf: caddy-einbinden.sh <domain>}"
mkdir -p /etc/caddy/sites
sed "s|__DOMAIN__|$DOMAIN|g" /opt/website/server/deploy/website.caddy.vorlage > /etc/caddy/sites/website.caddy
if ! grep -qxF 'import /etc/caddy/sites/*.caddy' /etc/caddy/Caddyfile; then
    printf '\n# Weitere Seiten (Website, eingerichtet von /opt/website/server/deploy)\nimport /etc/caddy/sites/*.caddy\n' >> /etc/caddy/Caddyfile
    echo "   import-Zeile in /etc/caddy/Caddyfile ergänzt"
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl reload-or-restart caddy
