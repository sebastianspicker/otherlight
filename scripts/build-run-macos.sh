#!/usr/bin/env bash
# Builds the local macOS app without signing and optionally launches the verified bundle.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/apps/apple/Otherlight.xcodeproj"
SCHEME="Otherlight"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-/private/tmp/otherlight-derived-data}"
MACOS_BUILD_ARCH="${MACOS_BUILD_ARCH:-$(uname -m)}"
ACTION="${1:-build}"

if [[ "$ACTION" != "build" && "$ACTION" != "run" ]]; then
  echo "Usage: $0 [build|run]" >&2
  exit 64
fi

if [[ ! -d "$PROJECT" ]]; then
  echo "Xcode project not found: $PROJECT" >&2
  exit 66
fi

if [[ "$MACOS_BUILD_ARCH" != "arm64" && "$MACOS_BUILD_ARCH" != "x86_64" ]]; then
  echo "Unsupported macOS build architecture: $MACOS_BUILD_ARCH" >&2
  exit 65
fi

# shellcheck source=scripts/select-swift-toolchain.sh
source "$ROOT/scripts/select-swift-toolchain.sh"

xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -destination "platform=macOS,arch=$MACOS_BUILD_ARCH" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  CODE_SIGNING_ALLOWED=NO \
  ONLY_ACTIVE_ARCH=YES \
  build

APP_PATH="$(find "$DERIVED_DATA_PATH/Build/Products/Debug" -maxdepth 1 -type d -name '*.app' -print -quit)"
if [[ -z "$APP_PATH" ]]; then
  echo "Build succeeded but no app bundle was found under $DERIVED_DATA_PATH." >&2
  exit 70
fi

echo "Built $APP_PATH"
if [[ "$ACTION" == "run" ]]; then
  open "$APP_PATH"
fi
