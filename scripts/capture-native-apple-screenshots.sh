#!/usr/bin/env bash
# Captures the maintained macOS, iPad, and iPhone tour with the pinned release toolchain.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project="$root/native-apple/Otherlight.xcodeproj"
scheme="Otherlight"
output="${APPLE_SCREENSHOT_DIR:-$root/docs/screenshots/apple}"
required_xcode_version="Xcode 26.6"
required_ios_runtime="26.5"

# Prints the intentionally small public command surface.
usage() {
  cat <<'EOF'
Usage: capture-native-apple-screenshots.sh [--preflight]

  --preflight  Validate the pinned Xcode, Swift, destination, and simulator runtime
               without creating result bundles or screenshots.
EOF
}

preflight_only="no"
case "${1:-}" in
  "") ;;
  --preflight) preflight_only="yes" ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 64
    ;;
esac

if [[ ! -d "$project" ]]; then
  echo "Apple screenshot project not found: $project" >&2
  exit 66
fi

# Resolves the pinned Xcode without changing the machine-wide selection.
resolve_developer_dir() {
  if [[ -n "${DEVELOPER_DIR:-}" ]]; then
    if [[ ! -x "$DEVELOPER_DIR/usr/bin/xcodebuild" ]]; then
      echo "DEVELOPER_DIR does not contain xcodebuild: $DEVELOPER_DIR" >&2
      exit 69
    fi
    printf '%s\n' "$DEVELOPER_DIR"
    return
  fi

  local candidate xcode_app
  for xcode_app in \
    "$root"/.xcode/Xcode-26.6*.app \
    "$root"/.tools/Xcode-26.6*.app \
    "$root"/tools/Xcode-26.6*.app \
    /Applications/Xcode-26.6*.app; do
    candidate="$xcode_app/Contents/Developer"
    if [[ -x "$candidate/usr/bin/xcodebuild" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done

  candidate="$(/usr/bin/xcode-select --print-path 2>/dev/null || true)"
  if [[ -n "$candidate" && -x "$candidate/usr/bin/xcodebuild" ]]; then
    printf '%s\n' "$candidate"
    return
  fi

  echo "Could not find Xcode 26.6. Set DEVELOPER_DIR or install it at $root/.xcode/Xcode-26.6.app." >&2
  exit 69
}

developer_dir="$(resolve_developer_dir)"
export DEVELOPER_DIR="$developer_dir"
xcodebuild_bin="$developer_dir/usr/bin/xcodebuild"
xcrun_bin="$(command -v xcrun || true)"

if [[ -z "$xcrun_bin" || ! -x "$xcrun_bin" ]]; then
  echo "Unable to find xcrun for resolved DEVELOPER_DIR: $developer_dir" >&2
  exit 69
fi

# Fails closed unless Xcode and Swift match the release contract exactly.
validate_toolchain() {
  local xcode_version_output swift_version_output
  if ! xcode_version_output="$(DEVELOPER_DIR="$developer_dir" "$xcodebuild_bin" -version 2>&1)"; then
    echo "Unable to query Xcode at DEVELOPER_DIR=$developer_dir." >&2
    echo "$xcode_version_output" >&2
    exit 69
  fi
  if [[ "$(printf '%s\n' "$xcode_version_output" | sed -n '1p')" != "$required_xcode_version" ]]; then
    echo "Apple screenshot capture requires exact $required_xcode_version." >&2
    echo "Resolved DEVELOPER_DIR: $developer_dir" >&2
    echo "$xcode_version_output" >&2
    exit 69
  fi

  # shellcheck source=SCRIPTDIR/select-swift-toolchain.sh
  source "$root/scripts/select-swift-toolchain.sh"
  swift_version_output="$(DEVELOPER_DIR="$developer_dir" swift --version 2>&1)"
  if [[ ! "$swift_version_output" =~ Swift[[:space:]]version[[:space:]]6\.3\.3([[:space:]\(]|$) ]]; then
    echo "Apple screenshot capture requires exact Swift 6.3.3." >&2
    echo "Resolved DEVELOPER_DIR: $developer_dir" >&2
    echo "$swift_version_output" >&2
    exit 69
  fi

  OTHERLIGHT_SCREENSHOT_XCODE_BUILD="$(printf '%s\n' "$xcode_version_output" | sed -n '2p')"
  export OTHERLIGHT_SCREENSHOT_XCODE_BUILD
}

# Confirms both named devices and their pinned simulator runtime are available.
validate_destination_runtime() {
  local destinations runtimes
  if ! destinations="$(DEVELOPER_DIR="$developer_dir" "$xcodebuild_bin" -showdestinations -project "$project" -scheme "$scheme" -configuration Debug 2>&1)"; then
    echo "Unable to enumerate screenshot destinations with $required_xcode_version." >&2
    echo "Resolved DEVELOPER_DIR: $developer_dir" >&2
    echo "$destinations" >&2
    exit 70
  fi

  if ! runtimes="$(DEVELOPER_DIR="$developer_dir" "$xcrun_bin" simctl list runtimes 2>&1)"; then
    echo "Unable to enumerate installed iOS Simulator runtimes." >&2
    echo "Resolved DEVELOPER_DIR: $developer_dir" >&2
    echo "$runtimes" >&2
    exit 70
  fi
  if ! grep -Eq "^iOS ${required_ios_runtime}[[:space:]]" <<<"$runtimes"; then
    echo "Apple screenshot capture requires the iOS Simulator ${required_ios_runtime} runtime." >&2
    echo "Install iOS ${required_ios_runtime} in Xcode ${required_xcode_version}, then create the named iPad and iPhone simulators." >&2
    echo "Required destinations:" >&2
    echo "  platform=iOS Simulator,name=iPad Pro 13-inch (M5),OS=${required_ios_runtime}" >&2
    echo "  platform=iOS Simulator,name=iPhone 17 Pro,OS=${required_ios_runtime}" >&2
    echo "Installed runtimes:" >&2
    echo "$runtimes" >&2
    echo "Xcode destinations reported for $scheme:" >&2
    echo "$destinations" >&2
    exit 70
  fi

  if ! grep -Fq "iPad Pro 13-inch (M5)" <<<"$destinations" ||
    ! grep -Fq "iPhone 17 Pro" <<<"$destinations"; then
    echo "Required iOS Simulator destinations are unavailable for $scheme." >&2
    echo "Create the named devices using the iOS ${required_ios_runtime} runtime:" >&2
    echo "  iPad Pro 13-inch (M5)" >&2
    echo "  iPhone 17 Pro" >&2
    echo "Xcode destinations reported for $scheme:" >&2
    echo "$destinations" >&2
    exit 70
  fi

  if ! OTHERLIGHT_SCREENSHOT_MACOS_SDK="$(DEVELOPER_DIR="$developer_dir" "$xcrun_bin" --sdk macosx --show-sdk-version 2>&1)" ||
    ! OTHERLIGHT_SCREENSHOT_IOS_SIMULATOR_SDK="$(DEVELOPER_DIR="$developer_dir" "$xcrun_bin" --sdk iphonesimulator --show-sdk-version 2>&1)"; then
    echo "Unable to resolve macOS and iOS Simulator SDK versions from $developer_dir." >&2
    exit 70
  fi
  export OTHERLIGHT_SCREENSHOT_MACOS_SDK
  export OTHERLIGHT_SCREENSHOT_IOS_SIMULATOR_SDK
  export OTHERLIGHT_SCREENSHOT_IOS_RUNTIME="$required_ios_runtime"
}

validate_toolchain
validate_destination_runtime

if [[ "$preflight_only" == "yes" ]]; then
  echo "[capture] preflight passed: $required_xcode_version, Swift 6.3.3, iOS Simulator $required_ios_runtime"
  exit 0
fi

run_id="$(date -u +%Y%m%dT%H%M%SZ)"
result_root="$root/test-results/native-screenshots/$run_id"
mkdir -p "$result_root"

screenshot_tests=(
  "OtherlightUITests/OtherlightUITests/testCaptureSimulationTourFrame"
  "OtherlightUITests/OtherlightUITests/testCaptureParametersTourFrame"
  "OtherlightUITests/OtherlightUITests/testCaptureGuidedLabTourFrame"
)

# Runs the named screenshot tests and exports their app-surface attachments.
capture_destination() {
  local platform="$1"
  local destination="$2"
  local include_dark="$3"
  local result_bundle="$result_root/$platform.xcresult"
  local attachment_directory="$result_root/$platform-attachments"
  local only_testing=()
  # Captures run on this Apple-silicon host. A single active architecture keeps
  # Swift package and app modules compatible; Universal 2 is a separate archive gate.
  local architecture_settings=("ARCHS=arm64" "ONLY_ACTIVE_ARCH=YES")
  local signing_settings=("CODE_SIGNING_ALLOWED=NO")

  for test_identifier in "${screenshot_tests[@]}"; do
    only_testing+=("-only-testing:$test_identifier")
  done
  if [[ "$include_dark" == "yes" ]]; then
    only_testing+=(
      "-only-testing:OtherlightUITests/OtherlightUITests/testCaptureDarkHeroTourFrame"
    )
  fi
  DEVELOPER_DIR="$developer_dir" "$xcodebuild_bin" test \
      -project "$project" \
      -scheme "$scheme" \
      -configuration Debug \
      -destination "$destination" \
      -resultBundlePath "$result_bundle" \
      "${signing_settings[@]}" \
      "${architecture_settings[@]}" \
      "${only_testing[@]}"

  DEVELOPER_DIR="$developer_dir" "$xcrun_bin" xcresulttool export attachments \
    --path "$result_bundle" \
    --output-path "$attachment_directory"
}

# Launches one deterministic macOS state and captures only its visible app window.
capture_macos_window() {
  local scenario="$1"
  local appearance="$2"
  local file_name="$3"
  local app_bundle="$result_root/macos-derived-data/Build/Products/Debug/Otherlight.app"
  local executable="$app_bundle/Contents/MacOS/Otherlight"
  local attachment_directory="$result_root/macos-attachments"
  local app_pid window_id

  mkdir -p "$attachment_directory"
  OTHERLIGHT_SCREENSHOT_MODE=1 \
    OTHERLIGHT_SCREENSHOT_SCENARIO="$scenario" \
    OTHERLIGHT_SCREENSHOT_APPEARANCE="$appearance" \
    "$executable" >"$result_root/macos-$scenario-$appearance.log" 2>&1 &
  app_pid=$!

  window_id=""
  for _ in {1..40}; do
    if ! kill -0 "$app_pid" 2>/dev/null; then
      echo "macOS app exited before its screenshot window appeared." >&2
      cat "$result_root/macos-$scenario-$appearance.log" >&2
      return 1
    fi
    window_id="$(DEVELOPER_DIR="$developer_dir" "$xcrun_bin" swift \
      "$root/scripts/find-macos-window-id.swift" "$app_pid" 2>/dev/null || true)"
    [[ -n "$window_id" ]] && break
    sleep 0.25
  done

  if [[ -z "$window_id" ]]; then
    kill "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
    echo "Could not identify the Otherlight app window for capture." >&2
    return 1
  fi

  sleep 1
  if ! /usr/sbin/screencapture -x -l "$window_id" "$attachment_directory/$file_name"; then
    kill "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
    echo "macOS app-window capture failed. Grant Screen Recording permission to the invoking terminal." >&2
    return 1
  fi
  kill "$app_pid" 2>/dev/null || true
  wait "$app_pid" 2>/dev/null || true
}

# Builds the credential-free macOS app once, then records its four tour states.
capture_macos_destination() {
  DEVELOPER_DIR="$developer_dir" "$xcodebuild_bin" build \
    -project "$project" \
    -scheme "$scheme" \
    -configuration Debug \
    -destination "platform=macOS" \
    -derivedDataPath "$result_root/macos-derived-data" \
    CODE_SIGNING_ALLOWED=NO \
    ARCHS=arm64 \
    ONLY_ACTIVE_ARCH=YES

  capture_macos_window "simulation" "light" "macos-simulation.png"
  capture_macos_window "parameters" "light" "macos-parameters.png"
  capture_macos_window "guided-lab" "light" "macos-guided-lab.png"
  capture_macos_window "simulation" "dark" "macos-dark-simulation.png"
}

capture_macos_destination
capture_destination "ipad" "platform=iOS Simulator,name=iPad Pro 13-inch (M5),OS=26.5" "no"
capture_destination "iphone" "platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5" "no"

node "$root/scripts/assemble-apple-screenshot-tour.mjs" \
  "$output" \
  "$result_root/macos-attachments" \
  "$result_root/ipad-attachments" \
  "$result_root/iphone-attachments"

echo "[capture] Apple tour written to $output"
