#!/bin/bash
set -euo pipefail
export PATH=/opt/pagehush/runtime/node/bin:$PATH
exec 9>/opt/pagehush/shared/deploy.lock
flock -x 9
tmp=$(mktemp -d)
oa=$(readlink -f /opt/pagehush/current)
ow=$(readlink -f /var/www/pagehush/current)
changed=0
stopped=0
link(){ ln -sfn "$1" "$2.next"; mv -Tf "$2.next" "$2"; }
cleanup(){
  s=$?
  trap - EXIT
  if ((s!=0)); then
    if ((changed)); then
      link "$oa" /opt/pagehush/current
      link "$ow" /var/www/pagehush/current
    fi
    if ((stopped)); then systemctl restart pagehush-api || true; fi
  fi
  rm -rf "$tmp"
  exit "$s"
}
trap cleanup EXIT
tar -xzf /opt/pagehush/shared/pagehush-release.tgz -C "$tmp"
p=$tmp/pagehush-release
[[ ! -d "$tmp/app" ]] || p=$tmp
test -f "$p/web/index.html"
test -f "$p/app/packages/api/dist/index.js"
test -f "$p/app/packages/shared/dist/index.js"
test -f "$p/app/packages/api/scripts/migrate.mjs"
test -f "$p/app/packages/api/drizzle/meta/_journal.json"
test -f "$p/backup-postgres.sh"
v=$(TZ=Asia/Shanghai date +%Y%m%d%H%M%S)
a=/opt/pagehush/releases/$v
w=/var/www/pagehush/releases/$v
mkdir "$a" "$w"
cp -a "$p/app/." "$a/"
cp -a "$p/web/." "$w/"
chown -R pagehush:pagehush "$a"
chown -R root:www-data "$w"
find "$w" -type d -exec chmod 750 {} +
find "$w" -type f -exec chmod 640 {} +
(
  cd "$a"
  runuser -u pagehush -- env PATH="$PATH" npm_config_cache="$a/.npm-cache" npm ci --omit=dev --workspace=@pagehush/api --workspace=@pagehush/shared --include-workspace-root=false
)
nginx -t
install -m 750 "$p/backup-postgres.sh" /opt/pagehush/scripts/backup-postgres.sh.next
mv -f /opt/pagehush/scripts/backup-postgres.sh.next /opt/pagehush/scripts/backup-postgres.sh
mkdir -p /etc/systemd/system/pagehush-backup-postgres.service.d
printf '[Service]\nEnvironmentFile=/opt/pagehush/shared/services.env\n' \
  > /etc/systemd/system/pagehush-backup-postgres.service.d/environment.conf
systemctl daemon-reload
stopped=1
systemctl stop pagehush-api
systemd-run --quiet --wait --pipe --collect --unit="pagehush-backup-$v" \
  --property=EnvironmentFile=/opt/pagehush/shared/services.env \
  /bin/bash /opt/pagehush/scripts/backup-postgres.sh
systemd-run --quiet --wait --pipe --collect --unit="pagehush-migrate-$v" \
  --uid=pagehush \
  --property=EnvironmentFile=/opt/pagehush/shared/services.env \
  --property=WorkingDirectory="$a" \
  /opt/pagehush/runtime/node/bin/node "$a/packages/api/scripts/migrate.mjs"
changed=1
link "$a" /opt/pagehush/current
systemctl restart pagehush-api
ok=0
for i in {1..30}; do
  if curl -fsS --max-time 5 http://127.0.0.1:8787/v1/ready >/dev/null; then ok=1; break; fi
  sleep 2
done
test "$ok" = 1
link "$w" /var/www/pagehush/current
echo "PageHush deployed: $v"
