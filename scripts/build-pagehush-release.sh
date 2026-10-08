#!/bin/bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

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
