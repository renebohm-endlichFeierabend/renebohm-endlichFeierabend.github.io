#!/usr/bin/env bash
# Baut die statische Website aus /opt/website nach /srv/website/current (als root aufrufen).
# Das Lehrer-Tool (npm) wird als Benutzer website-build in einer Sandbox gebaut: npm-Pakete führen beim
# Installieren fremden Code aus, der soll weder die Lerncoach- noch die Website-Daten sehen.
set -euo pipefail

REPO=/opt/website
CACHE=/var/cache/website-build
WWW=/srv/website
SPERREN="-/var/lib/lerncoach -/etc/lerncoach -/var/backups/lerncoach -/opt/lerncoach -/var/lib/website -/etc/website -/var/backups/website -/root"

[[ $EUID -eq 0 ]] || { echo "Bitte als root ausführen." >&2; exit 1; }
rev="$(git -C "$REPO" rev-parse --short HEAD)"

echo "== Lehrer-Tool bauen ($rev)"
rm -rf "$CACHE/src"
cp -a "$REPO/tool" "$CACHE/src"
rm -rf "$CACHE/src/node_modules" "$CACHE/src/dist"
chown -R website-build:website-build "$CACHE/src"
systemd-run --wait --pipe --collect --quiet \
    --uid=website-build --gid=website-build \
    -p WorkingDirectory="$CACHE/src" \
    -p Environment=HOME="$CACHE" -p Environment=npm_config_cache="$CACHE/.npm" \
    -p NoNewPrivileges=yes -p PrivateTmp=yes -p PrivateDevices=yes \
    -p ProtectSystem=strict -p ProtectHome=yes -p ReadWritePaths="$CACHE" \
    -p InaccessiblePaths="$SPERREN" \
    -p MemoryMax=1500M \
    /bin/sh -c 'npm ci --no-audit --no-fund --loglevel=error && npm run build'

echo "== Seite zusammenstellen"
neu="$WWW/releases/$(date +%Y%m%d-%H%M%S)-$rev"
mkdir -p "$neu/tool"
# wie bisher der GitHub-Workflow: Seiten und Dateien im Hauptordner, assets/, gebautes Tool unter /tool/
cp "$REPO"/*.html "$neu/"
for ext in jpg jpeg png webp svg ico css js txt xml; do
    cp "$REPO"/*."$ext" "$neu/" 2>/dev/null || true
done
cp -r "$REPO/assets" "$neu/"
cp -r "$CACHE/src/dist/." "$neu/tool/"
chown -R root:root "$neu"
chmod -R u=rwX,go=rX "$neu"

ln -sfn "$neu" "$WWW/current.neu"
mv -T "$WWW/current.neu" "$WWW/current"
# die letzten drei Stände behalten (zum Zurückschalten: Link current umsetzen)
ls -1dt "$WWW"/releases/*/ | tail -n +4 | xargs -r rm -rf
echo "   $WWW/current -> $neu"
