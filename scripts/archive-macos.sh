#!/usr/bin/env bash
# Archives the macOS alpha with explicit signing inputs and reproducible output paths.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/native-apple/Otherlight.xcodeproj"
SCHEME="Otherlight"
ARCHIVE_PATH="${ARCHIVE_PATH:-$ROOT/artifacts/Otherlight.xcarchive}"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-/private/tmp/otherlight-release-derived-data}"
MARKETING_VERSION="${MARKETING_VERSION:-0.3.0}"
BUILD_NUMBER="${BUILD_NUMBER:-1}"
SIGNING_IDENTITY="${SIGNING_IDENTITY:-Developer ID Application}"

: "${DEVELOPMENT_TEAM:?Set DEVELOPMENT_TEAM to the Apple Developer Team ID used for Developer ID signing.}"

if [[ ! -d "$PROJECT" ]]; then
  echo "Xcode project not found: $PROJECT" >&2
  exit 66
fi
if [[ -e "$ARCHIVE_PATH" || -L "$ARCHIVE_PATH" ]]; then
  echo "Archive already exists: $ARCHIVE_PATH" >&2
  echo "Move or remove that generated archive before retrying." >&2
  exit 73
fi

# shellcheck source=scripts/select-swift-toolchain.sh
source "$ROOT/scripts/select-swift-toolchain.sh"

mkdir -p "$(dirname "$ARCHIVE_PATH")"

xcodebuild archive \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "generic/platform=macOS" \
  -archivePath "$ARCHIVE_PATH" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  MARKETING_VERSION="$MARKETING_VERSION" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="$SIGNING_IDENTITY" \
  CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO \
  ENABLE_HARDENED_RUNTIME=YES \
  ARCHS="arm64 x86_64" \
  ONLY_ACTIVE_ARCH=NO

APP_PATH="$ARCHIVE_PATH/Products/Applications/Otherlight.app"
APP_COUNT="$(find "$ARCHIVE_PATH/Products/Applications" -maxdepth 1 -type d -name '*.app' -print | wc -l | tr -d ' ')"
if [[ "$APP_COUNT" != "1" || ! -d "$APP_PATH" || -L "$APP_PATH" ]]; then
  echo "Archive must contain exactly Otherlight.app: $ARCHIVE_PATH" >&2
  exit 70
fi

codesign --verify --strict --verbose=2 "$APP_PATH"
echo "Archived $APP_PATH"
