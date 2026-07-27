/**
 * Extracts native app-surface screenshots into the public Apple tour and records
 * exact toolchain, device, image, and Git provenance for later review.
 */

/* global Buffer, console, process */

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gitCaptureBoundary } from "./capture-git-boundary.mjs";

const execFile = promisify(execFileCallback);
const root = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.resolve(process.argv[2] ?? path.join(root, "docs/screenshots/apple"));
const attachmentDirectories = process.argv.slice(3).map((directory) => path.resolve(directory));
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const expectedFrames = [
  {
    attachment: "macos-simulation",
    fileName: "01-macos-simulation.png",
    platform: "macOS",
    device: "Mac",
    appearance: "light",
  },
  {
    attachment: "macos-parameters",
    fileName: "02-macos-parameters.png",
    platform: "macOS",
    device: "Mac",
    appearance: "light",
  },
  {
    attachment: "macos-guided-lab",
    fileName: "03-macos-guided-lab.png",
    platform: "macOS",
    device: "Mac",
    appearance: "light",
  },
  {
    attachment: "ipad-simulation",
    fileName: "04-ipad-simulation.png",
    platform: "iPadOS",
    device: "iPad Pro 13-inch (M5)",
    appearance: "light",
  },
  {
    attachment: "ipad-parameters",
    fileName: "05-ipad-parameters.png",
    platform: "iPadOS",
    device: "iPad Pro 13-inch (M5)",
    appearance: "light",
  },
  {
    attachment: "ipad-guided-lab",
    fileName: "06-ipad-guided-lab.png",
    platform: "iPadOS",
    device: "iPad Pro 13-inch (M5)",
    appearance: "light",
  },
  {
    attachment: "iphone-simulation",
    fileName: "07-iphone-simulation.png",
    platform: "iOS",
    device: "iPhone 17 Pro",
    appearance: "light",
  },
  {
    attachment: "iphone-parameters",
    fileName: "08-iphone-parameters.png",
    platform: "iOS",
    device: "iPhone 17 Pro",
    appearance: "light",
  },
  {
    attachment: "iphone-guided-lab",
    fileName: "09-iphone-guided-lab.png",
    platform: "iOS",
    device: "iPhone 17 Pro",
    appearance: "light",
  },
  {
    attachment: "macos-dark-simulation",
    fileName: "10-macos-dark-simulation.png",
    platform: "macOS",
    device: "Mac",
    appearance: "dark",
  },
];

function normalized(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(candidate)));
    else files.push(candidate);
  }
  return files;
}

/** Resolves xcresult UUID exports back to their stable XCTAttachment names. */
async function namedPngs(directory) {
  const files = await walk(directory);
  const manifestPath = path.join(directory, "manifest.json");
  const attachmentMetadata = new Map();
  try {
    const groups = JSON.parse(await readFile(manifestPath, "utf8"));
    for (const group of groups) {
      for (const attachment of group.attachments ?? []) {
        attachmentMetadata.set(attachment.exportedFileName, {
          name: attachment.suggestedHumanReadableName,
          capturedAt: new Date(attachment.timestamp * 1000).toISOString(),
        });
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return files
    .filter((file) => path.extname(file).toLowerCase() === ".png")
    .map((file) => {
      const metadata = attachmentMetadata.get(path.basename(file));
      return { file, name: metadata?.name ?? path.basename(file), capturedAt: metadata?.capturedAt };
    });
}

function pngMetadata(bytes, fileName) {
  if (bytes.length < 24 || !bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error(`${fileName} is not a valid PNG`);
  }
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

/** Reads the exact SDK and host versions used by the native capture process. */
async function captureEnvironment() {
  const [
    { stdout: xcodeVersion },
    { stdout: swiftVersion },
    { stdout: macOSSDKVersion },
    { stdout: iOSSimulatorSDKVersion },
    { stdout: simulatorRuntimes },
    { stdout: hostVersion },
    { stdout: hostBuild },
  ] = await Promise.all([
    execFile("xcodebuild", ["-version"]),
    execFile("swift", ["--version"]),
    execFile("xcrun", ["--sdk", "macosx", "--show-sdk-version"]),
    execFile("xcrun", ["--sdk", "iphonesimulator", "--show-sdk-version"]),
    execFile("xcrun", ["simctl", "list", "runtimes", "--json"]),
    execFile("sw_vers", ["-productVersion"]),
    execFile("sw_vers", ["-buildVersion"]),
  ]);
  const xcodeLines = xcodeVersion.trim().split("\n");
  const swiftLine = swiftVersion.trim().split("\n")[0];
  if (xcodeLines[0] !== "Xcode 26.6") {
    throw new Error(`Apple screenshot provenance requires exact Xcode 26.6; found ${xcodeLines[0]}`);
  }
  if (!swiftLine.includes("Swift version 6.3.3")) {
    throw new Error(`Apple screenshot provenance requires exact Swift 6.3.3; found ${swiftLine}`);
  }

  const runtimes = JSON.parse(simulatorRuntimes).runtimes ?? [];
  const iOSRuntime = runtimes.find((runtime) => runtime.name === "iOS 26.5" && runtime.isAvailable !== false);
  if (!iOSRuntime) {
    throw new Error("Apple screenshot provenance requires the available iOS 26.5 simulator runtime");
  }

  return {
    toolchain: {
      xcode: xcodeLines[0],
      xcodeBuild: xcodeLines[1] ?? "unknown",
      swift: swiftLine,
      captureTool: "hybrid native app-surface capture",
    },
    sdks: {
      macOS: macOSSDKVersion.trim(),
      iOSSimulator: iOSSimulatorSDKVersion.trim(),
    },
    runtimes: {
      macOS: { version: hostVersion.trim(), build: hostBuild.trim() },
      iOS: {
        name: iOSRuntime.name,
        version: iOSRuntime.version,
        build: iOSRuntime.buildversion,
        identifier: iOSRuntime.identifier,
      },
    },
  };
}

if (attachmentDirectories.length === 0) {
  throw new Error("Provide at least one xcresult attachment-export directory");
}

const extractedPngs = (await Promise.all(attachmentDirectories.map(namedPngs))).flat();
await mkdir(outputDirectory, { recursive: true });
const environment = await captureEnvironment();

const frames = [];
for (const expected of expectedFrames) {
  const attachmentKey = normalized(expected.attachment);
  const source = extractedPngs.find(({ name }) => normalized(name).includes(attachmentKey));
  if (!source) {
    throw new Error(
      `Missing native screenshot ${expected.attachment}; exported PNGs: ${extractedPngs.map(({ name }) => name).join(", ")}`,
    );
  }
  const destination = path.join(outputDirectory, expected.fileName);
  await copyFile(source.file, destination);
  const bytes = await readFile(destination);
  const sourceStat = await stat(source.file);
  frames.push({
    fileName: expected.fileName,
    scenario: expected.attachment.replace(/^(macos|ipad|iphone)-/, ""),
    appearance: expected.appearance,
    platform: expected.platform,
    device: expected.device,
    captureTool:
      expected.platform === "macOS" ? "macOS app-window capture" : "XCUITest app-surface attachment",
    runtime: expected.platform === "macOS" ? environment.runtimes.macOS : environment.runtimes.iOS,
    capturedAt: source.capturedAt ?? sourceStat.mtime.toISOString(),
    png: pngMetadata(bytes, expected.fileName),
  });
}

const manifest = {
  schemaVersion: "apple-screenshot-provenance-v2",
  release: { nativeAppleVersion: "0.3.0-alpha.1" },
  toolchain: environment.toolchain,
  sdks: environment.sdks,
  captureBase: await gitCaptureBoundary(
    root,
    "Capture-time Git provenance only; this does not attest to a later release candidate.",
  ),
  frames,
};
await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[capture] assembled ${frames.length}-image native Apple tour`);
