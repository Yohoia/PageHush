#!/bin/bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Flow's bundled Node installer may not yet mirror the required release.
if [[ $(node --version) != v24.21.0 || $(npm --version) != 11.19.0 ]]; then
  [[ $(uname -s) == Linux && $(uname -m) == x86_64 ]]
  runtime=$(mktemp -d)
  trap 'rm -rf "$runtime"' EXIT
  archive=node-v24.21.0-linux-x64.tar.xz
  curl --fail --location --retry 3 --max-time 180 \
    "https://nodejs.org/dist/v24.21.0/$archive" -o "$runtime/$archive"
  (cd "$runtime" && printf '%s  %s\n' \
    fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6 \
    "$archive" | sha256sum --check -)
  tar -xJf "$runtime/$archive" -C "$runtime"
  export PATH="$runtime/node-v24.21.0-linux-x64/bin:$PATH"
  if [[ $(npm --version) != 11.19.0 ]]; then
    npm install --global npm@11.19.0
  fi
fi

node --version
npm --version
npm ci
npm run typecheck
npm run lint
npm run test
npm run build

# Recreate only the generated artifact directory.
rm -rf pagehush-release
mkdir -p pagehush-release/web
mkdir -p pagehush-release/app/packages/{api,shared,web,worker}
cp -a packages/web/dist/. pagehush-release/web/
cp package.json package-lock.json pagehush-release/app/
cp -a packages/api/package.json packages/api/dist pagehush-release/app/packages/api/
cp -a packages/shared/package.json packages/shared/dist pagehush-release/app/packages/shared/
cp packages/web/package.json pagehush-release/app/packages/web/
cp packages/worker/package.json pagehush-release/app/packages/worker/
cp scripts/deploy-pagehush.sh pagehush-release/deploy.sh
git rev-parse HEAD > pagehush-release/web/version.txt
