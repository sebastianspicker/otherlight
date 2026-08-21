#!/usr/bin/env bash
# Runs the broad local release loop in the same order used for alpha evidence.

set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Run: corepack enable && corepack install" >&2
  exit 1
fi

CI=1 pnpm install --frozen-lockfile
pnpm ci:verify
pnpm smoke:served
pnpm audit:security
pnpm science:verify
