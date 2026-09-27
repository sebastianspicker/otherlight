#!/usr/bin/env bash
# Selects and verifies the exact Swift compiler required by the shared native Apple lane.

set -euo pipefail

transit_xcode_developer_dir="/Applications/Xcode-26.6.0.app/Contents/Developer"

if [[ -d "$transit_xcode_developer_dir" ]]; then
  export DEVELOPER_DIR="$transit_xcode_developer_dir"
fi

# xcodebuild must use the selected Xcode toolchain, never a process-inherited override.
unset TOOLCHAINS

if ! transit_swift_version_output="$(swift --version 2>&1)"; then
  echo "Unable to resolve Swift from the current developer environment." >&2
  exit 69
fi

if [[ ! "$transit_swift_version_output" =~ Swift[[:space:]]version[[:space:]]6\.3\.3([[:space:]\(]|$) ]]; then
  echo "Expected exact Swift 6.3.3 for native Apple work." >&2
  echo "$transit_swift_version_output" >&2
  echo "Select Xcode 26.6; /Applications/Xcode-26.6.0.app is selected automatically when present." >&2
  exit 69
fi

echo "$transit_swift_version_output"
