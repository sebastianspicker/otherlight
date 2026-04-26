#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=./audit-lib.sh
source "$ROOT_DIR/scripts/audit-lib.sh"

mkdir -p docs/audit

TS_PRUNE_OUT="docs/audit/latest-ts-prune.txt"
MADGE_OUT="docs/audit/latest-madge-orphans.txt"

run_optional_dlx() {
  local label="$1"
  local output_file="$2"
  local match="$3"
  shift 3

  if output=$(run_command_capture "$@"); then
    printf '%s\n' "$output" > "$output_file"
    return 0
  fi

  if handle_registry_403 "$label" "$output" "$match"; then
    : > "$output_file"
    return 2
  fi

  echo "$output"
  return 1
}

ts_prune_state="ok"
if run_optional_dlx "audit:deadcode:ts-prune" "$TS_PRUNE_OUT" 'registry.npmjs.org/ts-prune' pnpm dlx ts-prune -p tsconfig.json; then
  true
else
  code=$?
  if [[ $code -eq 2 ]]; then
    ts_prune_state="skipped"
  else
    exit $code
  fi
fi

if run_optional_dlx "audit:deadcode:madge" "$MADGE_OUT" 'registry.npmjs.org/madge' pnpm dlx madge --extensions ts src --orphans; then
  true
else
  code=$?
  if [[ $code -eq 2 ]]; then
    echo "[audit:deadcode] skipping orphan scan because madge is unavailable." >&2
    echo "Dead-code audit skipped in non-strict mode due to registry restrictions."
    echo " - ts-prune report: $TS_PRUNE_OUT"
    echo " - madge orphan report: $MADGE_OUT"
    exit 0
  fi
  exit $code
fi

ALLOWED_ORPHANS=("main.ts")

actual_orphans=$(
  tail -n +2 "$MADGE_OUT" \
    | sed '/^Processed /d' \
    | sed '/^$/d' \
    | sed 's/\r//g' \
    | sed 's/^[[:space:]]*//'
)

unexpected=()
while IFS= read -r orphan; do
  [[ -z "$orphan" ]] && continue
  allowed=false
  for item in "${ALLOWED_ORPHANS[@]}"; do
    if [[ "$orphan" == "$item" || "$orphan" == *"$item" ]]; then
      allowed=true
      break
    fi
  done
  if [[ "$allowed" == "false" ]]; then
    unexpected+=("$orphan")
  fi
done <<< "$actual_orphans"

if [[ ${#unexpected[@]} -gt 0 ]]; then
  echo "Unexpected orphan modules detected:" >&2
  printf ' - %s\n' "${unexpected[@]}" >&2
  exit 1
fi

echo "Dead-code audit passed with documented orphan allowlist."
if [[ "$ts_prune_state" == "skipped" ]]; then
  echo " - ts-prune report unavailable (tool fetch blocked by registry policy)."
else
  echo " - ts-prune report: $TS_PRUNE_OUT"
fi
echo " - madge orphan report: $MADGE_OUT"
