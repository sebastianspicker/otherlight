#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./audit-lib.sh
source "$ROOT_DIR/scripts/audit-lib.sh"

if output=$(run_command_capture pnpm audit --audit-level=high --prod); then
  echo "$output"
  exit 0
fi

if handle_registry_403 "audit:security" "$output" 'ERR_PNPM_AUDIT_BAD_RESPONSE'; then
  exit 0
fi

echo "$output"
exit 1
