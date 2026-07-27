#!/usr/bin/env bash
# Selects and verifies the exact Swift compiler required by the shared native Apple lane.

set -euo pipefail

transit_swift_toolchain="org.swift.633202606251a"

if ! transit_swift_version_output="$(swift --version 2>&1)"; then
  echo "Unable to resolve Swift from the current developer environment." >&2
  exit 69
fi

if [[ ! "$transit_swift_version_output" =~ Swift[[:space:]]version[[:space:]]6\.3\.3([[:space:]\(]|$) ]] &&
  [[ -z "${TOOLCHAINS:-}" ]]; then
  if transit_candidate_output="$(TOOLCHAINS="$transit_swift_toolchain" swift --version 2>&1)" &&
    [[ "$transit_candidate_output" =~ Swift[[:space:]]version[[:space:]]6\.3\.3([[:space:]\(]|$) ]]; then
    export TOOLCHAINS="$transit_swift_toolchain"
    transit_swift_version_output="$transit_candidate_output"
  fi
fi

if [[ ! "$transit_swift_version_output" =~ Swift[[:space:]]version[[:space:]]6\.3\.3([[:space:]\(]|$) ]]; then
  echo "Expected exact Swift 6.3.3 for native Apple work." >&2
  echo "$transit_swift_version_output" >&2
  echo "Select Xcode 26.6 or set TOOLCHAINS=$transit_swift_toolchain." >&2
  exit 69
fi

echo "$transit_swift_version_output"
