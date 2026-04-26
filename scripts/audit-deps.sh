#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./audit-lib.sh
source "$ROOT_DIR/scripts/audit-lib.sh"

if output=$(run_command_capture pnpm dlx depcheck --ignores=@vitest/coverage-v8); then
  echo "$output"
  exit 0
fi

if handle_registry_403 "audit:deps" "$output" 'registry.npmjs.org/depcheck'; then
  exit 0
fi

echo "$output"
exit 1
