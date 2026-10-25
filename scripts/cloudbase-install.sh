#!/usr/bin/env sh
set -eu

# CloudBase's command field accepts one command; keep setup failures fatal here.
node scripts/cloudbase-modules.mjs install
npx --yes pnpm@11.28.2 install --frozen-lockfile
