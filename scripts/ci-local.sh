#!/usr/bin/env bash
# Runs the broad local release loop in the same order used for alpha evidence.

set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Run: corepack enable && corepack install" >&2
  exit 1
fi

CI=1 pnpm install --frozen-lockfile
pnpm ci:verify
pnpm exec playwright install chromium firefox webkit
pnpm ci:e2e
pnpm smoke:served
pnpm test:coverage
pnpm audit:security
pnpm science:verify
pnpm literature-benchmarks
pnpm scientific-calibration
pnpm didactics-acceptance
pnpm perf-smoke
pnpm physics-regression
pnpm migration-regression
