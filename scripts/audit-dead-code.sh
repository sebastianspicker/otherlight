#!/usr/bin/env bash
# Audits TypeScript exports and orphan modules without deleting source files.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'EOF'
Usage: scripts/audit-dead-code.sh [--stdout] [--output-dir DIR]

Options:
  --stdout          Write reports to a temporary directory and print them.
  --output-dir DIR  Write reports to DIR instead of docs/audit.
EOF
}

stdout_only=false
output_dir="docs/audit"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stdout)
      stdout_only=true
      shift
      ;;
    --output-dir)
      if [[ $# -lt 2 || -z "$2" ]]; then
        echo "Missing directory for --output-dir" >&2
        usage >&2
        exit 2
      fi
      output_dir="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

cleanup_dir=""
if [[ "$stdout_only" == "true" ]]; then
  cleanup_dir="$(mktemp -d)"
  output_dir="$cleanup_dir"
  trap 'rm -rf "$cleanup_dir"' EXIT
fi

mkdir -p "$output_dir"

TS_PRUNE_OUT="$output_dir/latest-ts-prune.txt"
MADGE_OUT="$output_dir/latest-madge-orphans.txt"

pnpm dlx ts-prune -p tsconfig.json > "$TS_PRUNE_OUT" || true
pnpm dlx madge --extensions ts src --orphans > "$MADGE_OUT"

ALLOWED_ORPHANS=(
  "main.ts"
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
if [[ "$stdout_only" == "true" ]]; then
  echo
  echo "== ts-prune report =="
  cat "$TS_PRUNE_OUT"
  echo
  echo "== madge orphan report =="
  cat "$MADGE_OUT"
else
  echo " - ts-prune report: $TS_PRUNE_OUT"
  echo " - madge orphan report: $MADGE_OUT"
fi
