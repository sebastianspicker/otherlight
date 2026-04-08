#!/usr/bin/env bash
set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Run: corepack enable && corepack prepare pnpm@9.0.0 --activate" >&2
  exit 1
fi

CI=1 pnpm install --frozen-lockfile
pnpm ci:verify
pnpm test:coverage
pnpm audit:deps

if [[ "${CI_AUDIT:-}" == "1" ]]; then
  pnpm audit --audit-level=high --prod
fi
