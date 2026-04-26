#!/usr/bin/env bash

is_strict_audit_mode() {
  [[ "${AUDIT_STRICT:-0}" == "1" ]]
}

run_command_capture() {
  set +e
  local out
  out=$("$@" 2>&1)
  local status=$?
  set -e
  printf '%s' "$out"
  return $status
}

handle_registry_403() {
  local label="$1"
  local output="$2"
  local match_pattern="$3"

  if ! echo "$output" | grep -q '403'; then
    return 1
  fi

  if [[ -n "$match_pattern" ]] && ! echo "$output" | grep -q "$match_pattern"; then
    return 1
  fi

  echo "$output"
  echo "[$label] blocked by registry/network policy (403)." >&2
  if is_strict_audit_mode; then
    echo "[$label] failing because AUDIT_STRICT=1." >&2
    return 2
  fi

  echo "[$label] continuing in non-strict mode (set AUDIT_STRICT=1 to fail)." >&2
  return 0
}
