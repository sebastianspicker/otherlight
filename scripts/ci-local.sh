#!/usr/bin/env bash
set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Run: corepack enable && corepack prepare pnpm@9.0.0 --activate" >&2
  exit 1
fi

CI=1 pnpm install --frozen-lockfile
pnpm ci:verify
pnpm exec playwright install chromium
pnpm ci:e2e
pnpm smoke:served
pnpm test:coverage
pnpm audit:deps
pnpm literature-benchmarks
pnpm scientific-calibration
pnpm didactics-acceptance
pnpm perf-smoke
pnpm physics-regression
pnpm migration-regression

if [[ "${CI_AUDIT:-}" == "1" ]]; then
  pnpm audit --audit-level=high
fi
