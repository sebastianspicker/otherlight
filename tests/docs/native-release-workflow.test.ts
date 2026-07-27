/** Verifies Apple CI covers the shared target without publication credentials. */

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const appleWorkflow = readFileSync(join(process.cwd(), ".github", "workflows", "native-apple.yml"), "utf8");
const dmgWorkflow = readFileSync(join(process.cwd(), ".github", "workflows", "native-macos-dmg.yml"), "utf8");
const rootSwiftVersion = readFileSync(join(process.cwd(), ".swift-version"), "utf8").trim();
const nativeSwiftVersion = readFileSync(join(process.cwd(), "native-apple", ".swift-version"), "utf8").trim();
const nativeInfoPlist = readFileSync(join(process.cwd(), "native-apple", "App", "Info.plist"), "utf8");
const coreManifest = readFileSync(
  join(process.cwd(), "native-apple", "Packages", "OtherlightCore", "Package.swift"),
  "utf8",
);
const scienceManifest = readFileSync(
  join(process.cwd(), "native-apple", "Packages", "OtherlightScience", "Package.swift"),
  "utf8",
);
const screenshotScript = readFileSync(
  join(process.cwd(), "scripts", "capture-native-apple-screenshots.sh"),
  "utf8",
);
const screenshotAssembler = readFileSync(
  join(process.cwd(), "scripts", "assemble-apple-screenshot-tour.mjs"),
  "utf8",
);
const swiftToolchainSelector = readFileSync(
  join(process.cwd(), "scripts", "select-swift-toolchain.sh"),
  "utf8",
);

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents, "utf8");
  chmodSync(path, 0o755);
}

describe("native Apple workflow contracts", () => {
  it("pins exact Swift 6.3.3 while requiring Swift tools 6.3", () => {
    expect(rootSwiftVersion).toBe("6.3.3");
    expect(nativeSwiftVersion).toBe("6.3.3");
    expect(coreManifest.startsWith("// swift-tools-version: 6.3\n")).toBe(true);
    expect(scienceManifest.startsWith("// swift-tools-version: 6.3\n")).toBe(true);
  });

  it("tests the shared target on macOS, iPhone, and iPad with the pinned toolchain", () => {
    expect(appleWorkflow).toContain("native-apple/Otherlight.xcodeproj");
    expect(appleWorkflow).toContain("platform=macOS");
    expect(appleWorkflow).toContain("name=iPhone 17 Pro,OS=26.5");
    expect(appleWorkflow).toContain("name=iPad Pro 13-inch (M5),OS=26.5");
    expect(appleWorkflow).toContain("Xcode 26.6");
    expect(appleWorkflow).toContain("Swift version 6.3.3");
    expect(appleWorkflow).toContain("swift test --package-path native-apple/Packages/OtherlightCore");
    expect(appleWorkflow).toContain("swift test --package-path native-apple/Packages/OtherlightScience");
    expect(appleWorkflow).toContain("-scheme Otherlight");
    expect(appleWorkflow).toContain("com.sebastianspicker.Otherlight");
    expect(nativeInfoPlist).toContain("com.sebastianspicker.Otherlight.workspace");
    expect(nativeInfoPlist).toContain("<string>otherlight</string>");
    expect(nativeInfoPlist).toContain("com.sebastianspicker.TransitLightCurveLab.workspace");
    expect(nativeInfoPlist).toContain("<string>transitlab</string>");
  });

  it("runs when any native contract input changes", () => {
    for (const contractPath of [
      "contracts/capabilities-v1/**",
      "contracts/education-v4/**",
      "contracts/science-v5/**",
      "contracts/workspace-v1/**",
    ]) {
      expect(appleWorkflow.match(new RegExp(contractPath.replace(/[/*]/g, "\\$&"), "g"))).toHaveLength(2);
    }
  });

  it("archives unsigned generic iOS output and validates its release metadata", () => {
    expect(appleWorkflow).toContain('destination "generic/platform=iOS"');
    expect(appleWorkflow).toContain("CODE_SIGNING_REQUIRED=NO");
    expect(appleWorkflow).toContain("CFBundleShortVersionString");
    expect(appleWorkflow).toContain("CFBundleVersion");
    expect(appleWorkflow).toContain("PrivacyInfo.xcprivacy");
    expect(appleWorkflow).toContain("Arrow must not resolve in mobile SourcePackages");
    expect(appleWorkflow).not.toMatch(/secrets\.|testflight|upload-artifact|gh release/i);
  });

  it("keeps DMG packaging separate, unsigned, and free of App Store or upload work", () => {
    expect(dmgWorkflow).toContain("generic/platform=macOS");
    expect(dmgWorkflow).toContain("CODE_SIGNING_ALLOWED=NO");
    expect(dmgWorkflow).toContain("hdiutil create");
    expect(dmgWorkflow).not.toMatch(/secrets\.|app store|notary|upload-artifact|gh release/i);
  });

  it("gates the hybrid ten-frame tour on exact Xcode and app-surface-only capture", () => {
    expect(screenshotScript).toContain('required_xcode_version="Xcode 26.6"');
    expect(screenshotScript).toContain("--preflight");
    expect(screenshotScript).toContain("resolve_developer_dir");
    expect(screenshotScript).toContain("DEVELOPER_DIR");
    expect(screenshotScript).toContain("Swift 6.3.3");
    expect(screenshotScript).toContain("simctl list runtimes");
    expect(screenshotScript).toContain("OTHERLIGHT_SCREENSHOT_XCODE_BUILD");
    expect(screenshotScript).toContain("OTHERLIGHT_SCREENSHOT_MACOS_SDK");
    expect(screenshotScript).toContain("OTHERLIGHT_SCREENSHOT_IOS_SIMULATOR_SDK");
    expect(screenshotScript).toContain("OTHERLIGHT_SCREENSHOT_IOS_RUNTIME");
    expect(screenshotScript).toContain("OTHERLIGHT_SCREENSHOT_MODE=1");
    expect(screenshotScript).toContain("iPad Pro 13-inch (M5),OS=26.5");
    expect(screenshotScript).toContain("iPhone 17 Pro,OS=26.5");
    expect(screenshotScript).toContain("xcresulttool export attachments");
    expect(screenshotScript).toContain('architecture_settings=("ARCHS=arm64" "ONLY_ACTIVE_ARCH=YES")');
    expect(screenshotScript).toContain("find-macos-window-id.swift");
    expect(screenshotScript).toContain("/usr/sbin/screencapture -x -l");
    expect(screenshotScript).not.toContain("CODE_SIGN_IDENTITY=-");
    expect(screenshotAssembler).toContain("apple-screenshot-provenance-v2");
    expect(screenshotAssembler).toContain("hybrid native app-surface capture");
    expect(screenshotAssembler).toContain("suggestedHumanReadableName");
    expect(screenshotAssembler).toContain('runtime.name === "iOS 26.5"');
    expect(screenshotAssembler).toContain('execFile("xcrun", ["--sdk", "macosx", "--show-sdk-version"])');
    expect(screenshotAssembler).toContain(
      'execFile("xcrun", ["--sdk", "iphonesimulator", "--show-sdk-version"])',
    );
    expect(screenshotAssembler).toContain("10-macos-dark-simulation.png");
  });

  it("preflights a project-local Xcode 26.6 without creating screenshot results", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "transit-screenshot-preflight-"));
    const scriptRoot = join(fixtureRoot, "scripts");
    const developerDir = join(fixtureRoot, ".xcode", "Xcode-26.6.app", "Contents", "Developer");
    const explicitDeveloperDir = join(fixtureRoot, "explicit", "Xcode-26.6.app", "Contents", "Developer");
    const developerBin = join(developerDir, "usr", "bin");

    try {
      mkdirSync(scriptRoot, { recursive: true });
      mkdirSync(join(fixtureRoot, "native-apple", "Otherlight.xcodeproj"), { recursive: true });
      mkdirSync(developerBin, { recursive: true });
      writeFileSync(join(scriptRoot, "capture-native-apple-screenshots.sh"), screenshotScript, "utf8");
      writeFileSync(join(scriptRoot, "select-swift-toolchain.sh"), swiftToolchainSelector, "utf8");
      writeExecutable(
        join(developerBin, "xcodebuild"),
        `#!/usr/bin/env bash
case "\${1:-}" in
  -version) printf 'Xcode 26.6\\nBuild version fixture\\n' ;;
  -showdestinations) printf 'Available destinations:\\n  iPad Pro 13-inch (M5)\\n  iPhone 17 Pro\\n' ;;
  *) exit 1 ;;
esac
`,
      );
      writeExecutable(
        join(developerBin, "xcrun"),
        `#!/usr/bin/env bash
if [[ "\${1:-}" == "simctl" ]]; then
  printf '== Runtimes ==\\niOS 26.5 (26.5 - fixture) - com.apple.CoreSimulator.SimRuntime.iOS-26-5\\n'
elif [[ "\${1:-}" == "--sdk" ]]; then
  printf '26.6\\n'
else
  exit 1
fi
`,
      );
      const swiftBin = join(fixtureRoot, "bin");
      mkdirSync(swiftBin, { recursive: true });
      writeExecutable(
        join(swiftBin, "swift"),
        "#!/usr/bin/env bash\nprintf 'Swift version 6.3.3 (fixture)\\n'\n",
      );

      const result = spawnSync(
        "bash",
        [join(scriptRoot, "capture-native-apple-screenshots.sh"), "--preflight"],
        {
          cwd: fixtureRoot,
          encoding: "utf8",
          env: { ...process.env, PATH: `${developerBin}:${swiftBin}:${process.env.PATH ?? ""}` },
        },
      );

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("preflight passed: Xcode 26.6, Swift 6.3.3, iOS Simulator 26.5");
      expect(existsSync(join(fixtureRoot, "test-results", "native-screenshots"))).toBe(false);

      const explicitBin = join(explicitDeveloperDir, "usr", "bin");
      const developerDirLog = join(fixtureRoot, "developer-dir.log");
      mkdirSync(explicitBin, { recursive: true });
      writeExecutable(
        join(explicitBin, "xcodebuild"),
        `#!/usr/bin/env bash
printf '%s\\n' "$DEVELOPER_DIR" > "$CAPTURE_FIXTURE_DEVELOPER_DIR_LOG"
case "\${1:-}" in
  -version) printf 'Xcode 26.6\\nBuild version explicit\\n' ;;
  -showdestinations) printf 'Available destinations:\\n  iPad Pro 13-inch (M5)\\n  iPhone 17 Pro\\n' ;;
  *) exit 1 ;;
esac
`,
      );
      writeExecutable(
        join(explicitBin, "xcrun"),
        `#!/usr/bin/env bash
if [[ "\${1:-}" == "simctl" ]]; then
  printf '== Runtimes ==\\niOS 26.5 (26.5 - fixture) - com.apple.CoreSimulator.SimRuntime.iOS-26-5\\n'
elif [[ "\${1:-}" == "--sdk" ]]; then
  printf '26.6\\n'
else
  exit 1
fi
`,
      );
      const explicitResult = spawnSync(
        "bash",
        [join(scriptRoot, "capture-native-apple-screenshots.sh"), "--preflight"],
        {
          cwd: fixtureRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            DEVELOPER_DIR: explicitDeveloperDir,
            CAPTURE_FIXTURE_DEVELOPER_DIR_LOG: developerDirLog,
            PATH: `${explicitBin}:${swiftBin}:${process.env.PATH ?? ""}`,
          },
        },
      );

      expect(explicitResult.status, explicitResult.stderr).toBe(0);
      expect(readFileSync(developerDirLog, "utf8")).toContain(explicitDeveloperDir);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
