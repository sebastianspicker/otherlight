#!/usr/bin/env bash
set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Run: corepack enable && corepack prepare pnpm@9.0.0 --activate" >&2
  exit 1
fi

pnpm install --frozen-lockfile
pnpm verify-production-ready

if [[ "${CI_AUDIT:-}" == "1" ]]; then
  pnpm audit --audit-level=high
fi
