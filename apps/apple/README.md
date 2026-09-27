# Otherlight for Apple platforms

`apps/apple/` contains two SwiftUI products. `Otherlight` is the iPhone and iPad
Education app for iOS 17 or later. `OtherlightMac` is the macOS 14 or later host
that shares the Education sources and, on its own, links the experimental
Arrow-backed V5 science package. The project uses Xcode 26.6 and Swift 6.3.3;
the Swift package manifests use tools version 6.3 and Swift language mode 6.

## Education scope

The app provides local Simulation and Guided Labs workflows, bounded scenario
controls, interactive and deterministic reference execution, playback, local
history, bundled offline system snapshots, and user-selected workspace, CSV, and
Markdown imports or exports. Advanced controls hold draft grid resolution,
quadratic limb darkening, and planet or moon phase settings until you apply them,
and invalid text stays available for correction. Reference mode averages
deterministic samples over the V4 observation window. Both paths remain Education
previews, not scientific execution. The built-in detached-binary catalog adds
barycentric two-star dynamics, normalized limb-darkened preview photometry,
hypothesis capture, parameter locking, and a guarded reveal that keeps the sky
visualization hidden until reveal. New workspace documents use the `.otherlight`
extension and the `com.sebastianspicker.Otherlight.workspace` UTI; existing
`.transitlab` documents using
`com.sebastianspicker.TransitLightCurveLab.workspace` stay import-compatible.

`Packages/OtherlightCore` holds the portable simulation, Education,
visualization, strict scientific-contract types, and the V4-to-V5 authoring
compiler. The mobile `Otherlight` target links the portable packages only.
`Packages/OtherlightScience` is a separate macOS-only Swift package with Arrow
dependencies, linked only by `OtherlightMac`. The Mac Scientific profile compiles
the accepted V4 Education state into a strict V5 request, runs one cancellable
native DOP853 job, and publishes validated Arrow bytes and provenance in memory.
Arrow and manifest exports are separate, explicit, user-selected operations. See
the [OtherlightScience package guide](Packages/OtherlightScience/README.md).

The Education app has no remote backend client, accounts, synchronization, live
catalog requests, scientific job execution, or scientific-result fallback, and
the Education session rejects Scientific-profile workspaces.

## Build, test, and run

Run commands from the repository root. The toolchain selector prefers
`/Applications/Xcode-26.6.0.app/Contents/Developer`, clears any inherited
`TOOLCHAINS`, and verifies Swift 6.3.3. Repository-owned `xcodebuild` calls also
clear `TOOLCHAINS` explicitly.

```bash
source scripts/select-swift-toolchain.sh
swift test --package-path apps/apple/Packages/OtherlightCore
swift test --package-path apps/apple/Packages/OtherlightScience
swift format lint --strict --recursive apps/apple
```

On a host where the SwiftPM process sandbox is unavailable, retry just the
package tests with `--disable-sandbox`.

CI runs the dedicated Mac host and the mobile Education target on these review
destinations:

```bash
xcodebuild test \
  -project apps/apple/OtherlightMac.xcodeproj \
  -scheme OtherlightMac \
  -configuration Debug \
  -destination 'platform=macOS' \
  CODE_SIGNING_ALLOWED=NO

xcodebuild test \
  -project apps/apple/Otherlight.xcodeproj \
  -scheme Otherlight \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' \
  CODE_SIGNING_ALLOWED=NO

xcodebuild test \
  -project apps/apple/Otherlight.xcodeproj \
  -scheme Otherlight \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5),OS=26.5' \
  CODE_SIGNING_ALLOWED=NO
```

For local testing, run `xcodebuild -showdestinations` against
`apps/apple/Otherlight.xcodeproj -scheme Otherlight` for mobile or
`apps/apple/OtherlightMac.xcodeproj -scheme OtherlightMac` for macOS. If the
exact CI simulator names or OS are not installed, substitute an available
destination and say so in your notes; do not present it as CI-equivalent
evidence.

Build or launch an unsigned local macOS bundle:

```bash
bash scripts/build-run-macos.sh build
bash scripts/build-run-macos.sh run
```

The script defaults to `DERIVED_DATA_PATH=/private/tmp/otherlight-derived-data`
and builds `OtherlightMac` for the active host architecture, so local
Swift-package modules and the app target use the same triple. Override
`DERIVED_DATA_PATH` for another writable build location, or set
`MACOS_BUILD_ARCH` to `arm64` or `x86_64` when you need an explicit local
architecture. Release archives keep their separate universal-build contract.

## Manual macOS packaging

macOS distribution is a manual three-step process. No script uploads to App
Store Connect, TestFlight, a release host, or another distribution service.

**1. Archive** a Developer ID-signed universal app. `DEVELOPMENT_TEAM` is
required. The script accepts `ARCHIVE_PATH`, `DERIVED_DATA_PATH`,
`MARKETING_VERSION`, `BUILD_NUMBER`, and `SIGNING_IDENTITY`; the defaults are
`artifacts/OtherlightMac.xcarchive`,
`/private/tmp/otherlight-release-derived-data`, `0.3.0`, `1`, and
`Developer ID Application`.

```bash
DEVELOPMENT_TEAM=YOUR_TEAM_ID \
SIGNING_IDENTITY='Developer ID Application: Your Name (YOUR_TEAM_ID)' \
bash scripts/archive-macos.sh
```

**2. Package** the signed app. The script verifies the app signature and bundle
identifier before creating the DMG. It accepts an optional output path and uses
`artifacts/OtherlightMac-0.3.0-alpha.1.dmg` by default. `EXPECTED_BUNDLE_ID`
defaults to `com.sebastianspicker.OtherlightMac`; set `SIGNING_IDENTITY` to sign
the DMG itself.

```bash
bash scripts/package-macos-dmg.sh \
  artifacts/OtherlightMac.xcarchive/Products/Applications/OtherlightMac.app \
  artifacts/OtherlightMac-0.3.0-alpha.1.dmg
```

**3. Notarize, staple, and verify** the DMG. `NOTARY_PROFILE` is required and
names a `notarytool` keychain profile; `NOTARY_KEYCHAIN` is optional. The
verification script requires `EXPECTED_TEAM_ID`, and also accepts
`EXPECTED_BUNDLE_ID`, `EXPECTED_MARKETING_VERSION`, `EXPECTED_BUILD_NUMBER`, and
`EXPECTED_EXECUTABLE`, with defaults `com.sebastianspicker.OtherlightMac`,
`0.3.0`, `1`, and `OtherlightMac`.

```bash
NOTARY_PROFILE=otherlight-notary bash scripts/notarize-macos.sh artifacts/OtherlightMac-0.3.0-alpha.1.dmg
EXPECTED_TEAM_ID=YOUR_TEAM_ID bash scripts/verify-macos-release.sh artifacts/OtherlightMac-0.3.0-alpha.1.dmg
```

The archive, package, notarization, and verification scripts reject symlink
inputs where relevant and refuse to overwrite existing archive, DMG, or checksum
outputs. Move existing outputs aside before a new attempt.

## Troubleshooting

| Symptom                                          | Check                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Toolchain selector fails                         | Install Xcode 26.6 at `/Applications/Xcode-26.6.0.app` or set `DEVELOPER_DIR` to another Xcode 26.6 developer directory.                                     |
| Package tests cannot start the sandbox           | Retry the package command with `--disable-sandbox`.                                                                                                          |
| `build-run-macos.sh` cannot find the app bundle  | Check `DERIVED_DATA_PATH` and the `OtherlightMac` scheme build output.                                                                                       |
| Debug cannot resolve local packages for `x86_64` | Keep Debug builds on the active architecture. Universal `arm64 x86_64` output is a separate Release archive contract.                                        |
| Simulator destination is unavailable             | Install iOS 26.5 and use the exact iPhone 17 Pro or iPad Pro 13-inch (M5) destination names.                                                                 |
| Archive or DMG script refuses an output          | The target already exists or is a symlink. Pick a new explicit path or move the prior output.                                                                |
| Notarization or verification fails               | Confirm the Developer ID signature, notarization profile, team identifier, version, build number, universal `arm64 x86_64` binary, and sandbox entitlements. |

## Security and privacy

The macOS target uses App Sandbox with user-selected read/write file access. The
release verifier rejects a signed app that carries an outbound-network
entitlement. The privacy manifest declares no collected data, no accessed API
categories, no tracking, and no tracking domains; [PRIVACY.md](PRIVACY.md) holds
the full data-handling policy.

## Runtime work and retained memory

Education calculations construct only the selected interactive or reference
engine, so series caching, generation handling, reference substeps, and request
coalescing keep their existing contracts. The native V5 publisher uses the same
certified propagation as the public full-state API but retains only sample times,
radial velocities, and work metadata for Arrow and manifest publication.

Run the portable benchmark from the repository root:

```bash
source scripts/select-swift-toolchain.sh
swift --version
swift run --package-path apps/apple/Packages/OtherlightCore OtherlightBenchmark
```

It reports interactive, reference, and series latency distributions plus a
separate resident-memory pass. Timing stays informational; sample/work and
retention assertions are required. See
[performance validation](../../docs/performance.md) for repeatable runs and
manual Instruments retained-history profiling.
