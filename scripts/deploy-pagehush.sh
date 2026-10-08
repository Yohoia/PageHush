#!/bin/bash
set -euo pipefail
export PATH=/opt/pagehush/runtime/node/bin:$PATH
exec 9>/opt/pagehush/shared/deploy.lock
flock -x 9
tmp=$(mktemp -d)
oa=$(readlink -f /opt/pagehush/current)
ow=$(readlink -f /var/www/pagehush/current)
changed=0
link(){ ln -sfn "$1" "$2.next"; mv -Tf "$2.next" "$2"; }
trap 's=$?; trap - EXIT; if ((s!=0 && changed)); then link "$oa" /opt/pagehush/current; link "$ow" /var/www/pagehush/current; systemctl restart pagehush-api || true; fi; rm -rf "$tmp"; exit "$s"' EXIT
tar -xzf /opt/pagehush/shared/pagehush-release.tgz -C "$tmp"
p=$tmp/pagehush-release
[[ ! -d "$tmp/app" ]] || p=$tmp
test -f "$p/web/index.html"
test -f "$p/app/packages/api/dist/index.js"
test -f "$p/app/packages/shared/dist/index.js"
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
runuser -u pagehush -- env PATH="$PATH" npm_config_cache="$a/.npm-cache" npm --prefix "$a" ci --omit=dev --workspace=@pagehush/api --workspace=@pagehush/shared --include-workspace-root=false
nginx -t
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
