# Otherlight for Apple platforms

`native-apple/` contains the universal SwiftUI Education app. It supports macOS 14 or later, iOS 17 or later, and iPadOS 17 or later. The project uses Xcode 26.6 and Swift 6.3.3; Swift package manifests use tools version 6.3 and Swift language mode 6.

## Education scope

The app provides local Simulation and Guided Labs workflows, bounded scenario controls, playback, local history, bundled offline system snapshots, and user-selected workspace, CSV, and Markdown imports or exports. New workspace documents use the `.otherlight` extension and `com.sebastianspicker.Otherlight.workspace` UTI. Existing `.transitlab` documents using `com.sebastianspicker.TransitLightCurveLab.workspace` remain import-compatible.

`Packages/OtherlightCore` contains portable simulation, Education, visualization, and strict scientific-contract types. The `Otherlight` app target links the portable packages only. `Packages/OtherlightScience` is a separate macOS-only Swift package with Arrow dependencies; it is not linked into the Education app and does not create an in-app scientific execution or Arrow export path.

The Education app does not provide a remote backend client, accounts, synchronization, live catalog requests, scientific job execution, or a scientific-result fallback. Scientific-profile workspaces are rejected by the Education session.

## Build, test, and run

Run commands from the repository root. The toolchain selector verifies Swift 6.3.3 and, when available, selects the matching toolchain.

```bash
source scripts/select-swift-toolchain.sh
swift test --package-path native-apple/Packages/OtherlightCore
swift test --package-path native-apple/Packages/OtherlightScience
swift format lint --strict --recursive native-apple
```

On a host where the SwiftPM process sandbox is unavailable, retry only the package tests with `--disable-sandbox`.

Run the shared app tests on each supported review destination:

```bash
xcodebuild test \
  -project native-apple/Otherlight.xcodeproj \
  -scheme Otherlight \
  -configuration Debug \
  -destination 'platform=macOS' \
  CODE_SIGNING_ALLOWED=NO

xcodebuild test \
  -project native-apple/Otherlight.xcodeproj \
  -scheme Otherlight \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' \
  CODE_SIGNING_ALLOWED=NO

xcodebuild test \
  -project native-apple/Otherlight.xcodeproj \
  -scheme Otherlight \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5),OS=26.5' \
  CODE_SIGNING_ALLOWED=NO
```

Build or launch an unsigned local macOS bundle:

```bash
scripts/build-run-macos.sh build
scripts/build-run-macos.sh run
```

The script defaults to `DERIVED_DATA_PATH=/private/tmp/otherlight-derived-data`. Override that variable if another writable derived-data location is required.

The maintained screenshot-tour commands require the exact Xcode installation:

```bash
DEVELOPER_DIR=/Applications/Xcode-26.6.0.app/Contents/Developer pnpm capture:tour:apple --preflight
DEVELOPER_DIR=/Applications/Xcode-26.6.0.app/Contents/Developer pnpm capture:tour:apple
```

## Manual macOS packaging

macOS distribution is a manual three-step process. No script uploads to App Store Connect, TestFlight, a release host, or another distribution service.

First archive a Developer ID-signed universal app. `DEVELOPMENT_TEAM` is required. The script accepts `ARCHIVE_PATH`, `DERIVED_DATA_PATH`, `MARKETING_VERSION`, `BUILD_NUMBER`, and `SIGNING_IDENTITY`; defaults are `artifacts/Otherlight.xcarchive`, `/private/tmp/otherlight-release-derived-data`, `0.3.0`, `1`, and `Developer ID Application` respectively.

```bash
DEVELOPMENT_TEAM=YOUR_TEAM_ID \
SIGNING_IDENTITY='Developer ID Application: Your Name (YOUR_TEAM_ID)' \
scripts/archive-macos.sh
```

Then package the signed app. The package script verifies the app signature and bundle identifier before creating the DMG. It accepts an optional output path and uses `artifacts/Otherlight-0.3.0-alpha.1.dmg` by default. `EXPECTED_BUNDLE_ID` defaults to `com.sebastianspicker.Otherlight`; set `SIGNING_IDENTITY` to sign the DMG itself.

```bash
scripts/package-macos-dmg.sh \
  artifacts/Otherlight.xcarchive/Products/Applications/Otherlight.app \
  artifacts/Otherlight-0.3.0-alpha.1.dmg
```

Finally, notarize, staple, and verify the DMG. `NOTARY_PROFILE` is required and names a `notarytool` keychain profile; `NOTARY_KEYCHAIN` is optional. The verification script requires `EXPECTED_TEAM_ID`. It also accepts `EXPECTED_BUNDLE_ID`, `EXPECTED_MARKETING_VERSION`, `EXPECTED_BUILD_NUMBER`, and `EXPECTED_EXECUTABLE`, with defaults `com.sebastianspicker.Otherlight`, `0.3.0`, `1`, and `Otherlight`.

```bash
NOTARY_PROFILE=otherlight-notary scripts/notarize-macos.sh artifacts/Otherlight-0.3.0-alpha.1.dmg
EXPECTED_TEAM_ID=YOUR_TEAM_ID scripts/verify-macos-release.sh artifacts/Otherlight-0.3.0-alpha.1.dmg
```

The archive, package, notarization, and verification scripts reject symlink inputs where relevant and refuse to overwrite existing archive, DMG, or checksum outputs. Move existing outputs aside before a new attempt.

## Troubleshooting

| Symptom                                          | Check                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Toolchain selector fails                         | Select Xcode 26.6 or set `TOOLCHAINS=org.swift.633202606251a`.                                                                                               |
| Package tests cannot start the sandbox           | Retry the package command with `--disable-sandbox`.                                                                                                          |
| `build-run-macos.sh` cannot find the app bundle  | Check `DERIVED_DATA_PATH` and the `Otherlight` scheme build output.                                                                                          |
| macOS cannot resolve local packages for `x86_64` | The current local app build has only `arm64` package modules. The Universal 2 application build remains unverified.                                          |
| Simulator destination is unavailable             | Install iOS 26.5 and use the exact iPhone 17 Pro or iPad Pro 13-inch (M5) destination names.                                                                 |
| Archive or DMG script refuses an output          | The target output already exists or is a symlink. Choose a new explicit path or move the prior output.                                                       |
| Notarization or verification fails               | Confirm the Developer ID signature, notarization profile, team identifier, version, build number, universal `arm64 x86_64` binary, and sandbox entitlements. |

## Security and privacy

The macOS target uses App Sandbox and user-selected read/write file access. The release verifier rejects a signed app that has an outbound-network entitlement. The privacy manifest declares no collected data, no accessed API categories, no tracking, and no tracking domains. See [PRIVACY.md](PRIVACY.md) for the data-handling policy.
