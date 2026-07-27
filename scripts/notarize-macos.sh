#!/usr/bin/env bash
# Submits a signed DMG for notarization, staples the ticket, and records its digest.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/Otherlight.dmg" >&2
  exit 64
fi

DMG_PATH="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
: "${NOTARY_PROFILE:?Set NOTARY_PROFILE to a notarytool keychain profile.}"

if [[ ! -f "$DMG_PATH" || -L "$DMG_PATH" ]]; then
  echo "Disk image not found: $DMG_PATH" >&2
  exit 66
fi
if [[ -e "$DMG_PATH.sha256" || -L "$DMG_PATH.sha256" ]]; then
  echo "Checksum file already exists: $DMG_PATH.sha256" >&2
  exit 73
fi

NOTARY_ARGUMENTS=(--keychain-profile "$NOTARY_PROFILE")
if [[ -n "${NOTARY_KEYCHAIN:-}" ]]; then
  NOTARY_ARGUMENTS+=(--keychain "$NOTARY_KEYCHAIN")
fi

xcrun notarytool submit "$DMG_PATH" "${NOTARY_ARGUMENTS[@]}" --wait
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"
(
  cd "$(dirname "$DMG_PATH")"
  shasum -a 256 "$(basename "$DMG_PATH")" > "$(basename "$DMG_PATH").sha256"
)

echo "Notarized and stapled $DMG_PATH"
echo "Wrote $DMG_PATH.sha256"
