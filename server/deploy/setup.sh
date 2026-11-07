#!/usr/bin/env bash
# Richtet die Website auf dem Server ein, neben dem Lerncoach, aber getrennt davon (als root).
# Mehrfach aufrufbar: vorhandene .env und Datenbank bleiben.
# Aufruf: bash setup.sh endlich-feierabend-ki.de [branch]
set -euo pipefail

DOMAIN="${1:-}"
BRANCH="${2:-main}"
REPO=/opt/website
URL=https://github.com/renebohm-endlichFeierabend/renebohm-endlichFeierabend.github.io.git
VENV=/opt/website-venv
ENVFILE=/etc/website/website.env

[[ $EUID -eq 0 ]] || { echo "Bitte als root ausführen." >&2; exit 1; }
[[ -n "$DOMAIN" ]] || { echo "Aufruf: $0 <domain> [branch]" >&2; exit 1; }

echo "== Pakete"
apt-get update -q
apt-get install -y -q python3 python3-venv git curl caddy nodejs npm

echo "== Benutzer und Ordner"
id website >/dev/null 2>&1 || useradd --system --home-dir /var/lib/website --shell /usr/sbin/nologin website
id website-build >/dev/null 2>&1 || useradd --system --home-dir /var/cache/website-build --shell /usr/sbin/nologin website-build
install -d -o website -g website -m 700 /var/lib/website /var/backups/website
install -d -o website-build -g website-build -m 750 /var/cache/website-build
install -d -o root -g website -m 750 /etc/website
install -d -o root -g root -m 755 /srv/website /srv/website/releases

echo "== Repo"
if [[ ! -d "$REPO/.git" ]]; then
    git clone -q --branch "$BRANCH" "$URL" "$REPO"
fi
git -C "$REPO" log --oneline -1

echo "== Python-Umgebung"
[[ -x "$VENV/bin/python" ]] || python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q -r "$REPO/server/requirements.txt"

echo "== Einstellungen"
if [[ ! -f "$ENVFILE" ]]; then
    secret="$("$VENV/bin/python" -c 'import secrets; print(secrets.token_urlsafe(48))')"
    sed -e "s|__WIRD_ERZEUGT__|$secret|" -e "s|__DOMAIN__|$DOMAIN|" "$REPO/server/deploy/website.env.vorlage" > "$ENVFILE"
    echo "   $ENVFILE angelegt (SMTP-Zugang dort noch eintragen)"
else
    echo "   $ENVFILE besteht, bleibt unverändert"
fi
chown root:website "$ENVFILE"
chmod 640 "$ENVFILE"

echo "== Dienste"
install -m 644 "$REPO/server/deploy/website-api.service" "$REPO/server/deploy/website-backup.service" \
    "$REPO/server/deploy/website-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable website-api.service website-backup.timer
systemctl restart website-api.service
systemctl start website-backup.timer

echo "== Seite bauen"
bash "$REPO/server/deploy/bauen.sh"

echo "== HTTPS (Caddy)"
bash "$REPO/server/deploy/caddy-einbinden.sh" "$DOMAIN"

echo "== Prüfung"
for _ in $(seq 1 20); do curl -fsS http://127.0.0.1:8100/api/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:8100/api/health && echo
echo "Fertig. Seite: https://$DOMAIN (sobald DNS auf diesen Server zeigt)."
