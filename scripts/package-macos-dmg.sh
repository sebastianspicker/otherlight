#!/usr/bin/env bash
# Packages an already signed app into a reviewable DMG without replacing prior output.

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 /path/to/Otherlight.app [/path/to/output.dmg]" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -L "$1" ]]; then
  echo "Refusing symlinked app input: $1" >&2
  exit 66
fi
APP_PATH="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
OUTPUT_PATH_INPUT="${2:-$ROOT/artifacts/Otherlight-0.3.0-alpha.1.dmg}"
VOLUME_NAME="Otherlight"
EXPECTED_BUNDLE_ID="${EXPECTED_BUNDLE_ID:-com.sebastianspicker.Otherlight}"

if [[ ! -d "$APP_PATH" || "${APP_PATH##*.}" != "app" ]]; then
  echo "Signed app bundle not found: $APP_PATH" >&2
  exit 66
fi
OUTPUT_DIRECTORY="$(dirname "$OUTPUT_PATH_INPUT")"
mkdir -p "$OUTPUT_DIRECTORY"
OUTPUT_PATH="$(cd "$OUTPUT_DIRECTORY" && pwd -P)/$(basename "$OUTPUT_PATH_INPUT")"
if [[ -e "$OUTPUT_PATH" || -L "$OUTPUT_PATH" ]]; then
  echo "Disk image already exists: $OUTPUT_PATH" >&2
  echo "Move or remove that generated image before retrying." >&2
  exit 73
fi

codesign --verify --strict --verbose=2 "$APP_PATH"
INFO_PLIST="$APP_PATH/Contents/Info.plist"
if [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$INFO_PLIST")" != "$EXPECTED_BUNDLE_ID" ]]; then
  echo "Unexpected app bundle identifier." >&2
  exit 65
fi

STAGING_DIRECTORY="$(mktemp -d /private/tmp/otherlight-dmg.XXXXXX)"
trap 'rm -rf "$STAGING_DIRECTORY"' EXIT

ditto "$APP_PATH" "$STAGING_DIRECTORY/Otherlight.app"
ln -s /Applications "$STAGING_DIRECTORY/Applications"
hdiutil create \
  -volname "$VOLUME_NAME" \
  -srcfolder "$STAGING_DIRECTORY" \
  -format UDZO \
  -ov \
  "$OUTPUT_PATH"

if [[ -n "${SIGNING_IDENTITY:-}" ]]; then
  codesign --force --timestamp --sign "$SIGNING_IDENTITY" "$OUTPUT_PATH"
fi

echo "Created $OUTPUT_PATH"
