#!/usr/bin/env bash
# Mounts a notarized DMG and verifies trust, runtime flags, sandboxing, and architecture.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/notarized.dmg" >&2
  exit 64
fi

DMG_PATH="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
CHECKSUM_PATH="$DMG_PATH.sha256"
if [[ ! -f "$DMG_PATH" || -L "$DMG_PATH" ]]; then
  echo "Disk image not found: $DMG_PATH" >&2
  exit 66
fi
if [[ ! -f "$CHECKSUM_PATH" || -L "$CHECKSUM_PATH" ]]; then
  echo "Required checksum file not found: $CHECKSUM_PATH" >&2
  exit 66
fi

EXPECTED_CHECKSUM="$(awk 'NR == 1 { print $1 }' "$CHECKSUM_PATH")"
EXPECTED_CHECKSUM_FILE="$(awk 'NR == 1 { print $2 }' "$CHECKSUM_PATH")"
CHECKSUM_LINE_COUNT="$(wc -l < "$CHECKSUM_PATH" | tr -d ' ')"
if [[ "$CHECKSUM_LINE_COUNT" != "1" || ! "$EXPECTED_CHECKSUM" =~ ^[0-9a-f]{64}$ || "$EXPECTED_CHECKSUM_FILE" != "$(basename "$DMG_PATH")" ]]; then
  echo "Checksum file must contain exactly the expected DMG basename and one SHA-256 digest." >&2
  exit 65
fi
ACTUAL_CHECKSUM="$(shasum -a 256 "$DMG_PATH" | awk '{print $1}')"
if [[ "$ACTUAL_CHECKSUM" != "$EXPECTED_CHECKSUM" ]]; then
  echo "SHA-256 checksum mismatch." >&2
  exit 65
fi

hdiutil verify "$DMG_PATH"
codesign --verify --strict --verbose=2 "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"
spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG_PATH"

MOUNT_DIRECTORY="$(mktemp -d /private/tmp/otherlight-verify.XXXXXX)"
ENTITLEMENTS_PATH="$(mktemp /private/tmp/otherlight-entitlements.XXXXXX)"
cleanup() {
  hdiutil detach "$MOUNT_DIRECTORY" >/dev/null 2>&1 || true
  rm -rf "$MOUNT_DIRECTORY"
  rm -f "$ENTITLEMENTS_PATH"
}
trap cleanup EXIT

hdiutil attach -nobrowse -readonly -mountpoint "$MOUNT_DIRECTORY" "$DMG_PATH" >/dev/null
APP_PATH="$MOUNT_DIRECTORY/Otherlight.app"
APP_COUNT="$(find "$MOUNT_DIRECTORY" -maxdepth 1 -type d -name '*.app' -print | wc -l | tr -d ' ')"
if [[ "$APP_COUNT" != "1" || ! -d "$APP_PATH" || -L "$APP_PATH" ]]; then
  echo "The mounted disk image must contain exactly Otherlight.app." >&2
  exit 70
fi

codesign --verify --strict --verbose=2 "$APP_PATH"
spctl --assess --type execute --verbose=4 "$APP_PATH"
if ! codesign -dvv "$APP_PATH" 2>&1 | grep -q 'runtime'; then
  echo "Hardened Runtime flag is missing from the app signature." >&2
  exit 65
fi

INFO_PLIST="$APP_PATH/Contents/Info.plist"
EXPECTED_BUNDLE_ID="${EXPECTED_BUNDLE_ID:-com.sebastianspicker.Otherlight}"
EXPECTED_MARKETING_VERSION="${EXPECTED_MARKETING_VERSION:-0.3.0}"
EXPECTED_BUILD_NUMBER="${EXPECTED_BUILD_NUMBER:-1}"
EXPECTED_EXECUTABLE="${EXPECTED_EXECUTABLE:-Otherlight}"
: "${EXPECTED_TEAM_ID:?Set EXPECTED_TEAM_ID to the Apple Developer Team ID.}"
if [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$INFO_PLIST")" != "$EXPECTED_BUNDLE_ID" ]]; then
  echo "Unexpected bundle identifier." >&2
  exit 65
fi
if [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$INFO_PLIST")" != "$EXPECTED_MARKETING_VERSION" ]]; then
  echo "Unexpected marketing version." >&2
  exit 65
fi
if [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$INFO_PLIST")" != "$EXPECTED_BUILD_NUMBER" ]]; then
  echo "Unexpected build number." >&2
  exit 65
fi

EXECUTABLE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$INFO_PLIST")"
if [[ "$EXECUTABLE_NAME" != "$EXPECTED_EXECUTABLE" ]]; then
  echo "Unexpected executable name." >&2
  exit 65
fi
if ! codesign -dvv "$APP_PATH" 2>&1 | grep -Fxq "TeamIdentifier=$EXPECTED_TEAM_ID"; then
  echo "Unexpected signing team identifier." >&2
  exit 65
fi
ARCHITECTURES="$(lipo -archs "$APP_PATH/Contents/MacOS/$EXECUTABLE_NAME")"
for REQUIRED_ARCHITECTURE in arm64 x86_64; do
  if [[ " $ARCHITECTURES " != *" $REQUIRED_ARCHITECTURE "* ]]; then
    echo "Missing required architecture $REQUIRED_ARCHITECTURE (found: $ARCHITECTURES)." >&2
    exit 65
  fi
done

codesign -d --entitlements :- "$APP_PATH" > "$ENTITLEMENTS_PATH" 2>/dev/null
if [[ "$(/usr/libexec/PlistBuddy -c 'Print :com.apple.security.app-sandbox' "$ENTITLEMENTS_PATH")" != "true" ]]; then
  echo "App Sandbox entitlement is missing." >&2
  exit 65
fi
if [[ "$(/usr/libexec/PlistBuddy -c 'Print :com.apple.security.files.user-selected.read-write' "$ENTITLEMENTS_PATH")" != "true" ]]; then
  echo "User-selected read/write entitlement is missing." >&2
  exit 65
fi
if /usr/libexec/PlistBuddy -c 'Print :com.apple.security.network.client' "$ENTITLEMENTS_PATH" >/dev/null 2>&1; then
  echo "Unexpected outbound-network entitlement is present." >&2
  exit 65
fi

echo "Verified notarization, Gatekeeper, Universal 2, sandbox entitlements, and checksum."
