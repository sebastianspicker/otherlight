#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p docs/audit

TS_PRUNE_OUT="docs/audit/latest-ts-prune.txt"
MADGE_OUT="docs/audit/latest-madge-orphans.txt"

pnpm dlx ts-prune -p tsconfig.json > "$TS_PRUNE_OUT" || true
pnpm dlx madge --extensions ts src --orphans > "$MADGE_OUT"

ALLOWED_ORPHANS=(
  "main.ts"
  "photometry/transitQuadraticLD.ts"
  # Dedicated worker entrypoint loaded by bundler worker pipeline (?worker import).
  # Madge treats this as orphan although it is emitted and used at runtime.
  "sim/v4/referenceWorker.ts"
)

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
echo " - ts-prune report: $TS_PRUNE_OUT"
echo " - madge orphan report: $MADGE_OUT"
