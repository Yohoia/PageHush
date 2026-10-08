#!/bin/sh
set -eu
d=$(mktemp -d)
trap 'rm -rf "$d"' EXIT
tar -xzf /opt/pagehush/shared/pagehush-release.tgz -C "$d"
p="$d/pagehush-release/deploy.sh"
if [ ! -f "$p" ]; then p="$d/deploy.sh"; fi
test -f "$p"
bash "$p"
