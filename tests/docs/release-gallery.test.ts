/** Verifies the maintained website tour and the gated native capture contract. */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const screenshotRoot = join(process.cwd(), "docs", "screenshots");
const websiteDirectory = join(screenshotRoot, "web");
const appleDirectory = join(screenshotRoot, "apple");
const websiteManifestPath = join(websiteDirectory, "manifest.json");
const websiteGalleryPresent = existsSync(websiteManifestPath);
const appleManifestPath = join(appleDirectory, "manifest.json");
const appleGalleryPresent = existsSync(appleManifestPath);
const expectedWebsiteGallery = new Map([
  ["01-education-simulation.png", { width: 1440, height: 1000 }],
  ["02-guided-lab.png", { width: 1440, height: 1000 }],
  ["03-binary-black-box.png", { width: 1440, height: 1000 }],
  ["04-binary-revealed.png", { width: 1440, height: 1000 }],
  ["05-scientific-unavailable.png", { width: 1440, height: 1000 }],
  ["06-scientific-ready.png", { width: 1440, height: 1000 }],
  ["07-scientific-result.png", { minWidth: 1200, minHeight: 800 }],
  ["08-tablet-education.png", { width: 1024, height: 768 }],
  ["09-mobile-education.png", { width: 390, height: 844 }],
  ["10-dark-education.png", { width: 1440, height: 1000 }],
]);
const expectedCaptureModes = {
  "01-education-simulation.png": "scripted-browser",
  "02-guided-lab.png": "scripted-browser",
  "03-binary-black-box.png": "scripted-browser",
  "04-binary-revealed.png": "scripted-browser",
  "05-scientific-unavailable.png": "scripted-mocked-scientific-unavailable",
  "06-scientific-ready.png": "scripted-mocked-scientific-capability",
  "07-scientific-result.png": "scripted-contract-result",
  "08-tablet-education.png": "scripted-browser-tablet",
  "09-mobile-education.png": "scripted-browser-mobile",
  "10-dark-education.png": "scripted-browser",
};
const expectedAppleGallery = [
  "01-macos-simulation.png",
  "02-macos-parameters.png",
  "03-macos-guided-lab.png",
  "04-ipad-simulation.png",
  "05-ipad-parameters.png",
  "06-ipad-guided-lab.png",
  "07-iphone-simulation.png",
  "08-iphone-parameters.png",
  "09-iphone-guided-lab.png",
  "10-macos-dark-simulation.png",
];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngDimensions(fileName: string): { width: number; height: number } {
  const bytes = readFileSync(join(websiteDirectory, fileName));
  expect(bytes.subarray(0, pngSignature.length)).toEqual(pngSignature);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function sha256(fileName: string): string {
  return createHash("sha256")
    .update(readFileSync(join(websiteDirectory, fileName)))
    .digest("hex");
}

/** Hashes an image in a selected maintained gallery for provenance checks. */
function gallerySha256(directory: string, fileName: string): string {
  return createHash("sha256")
    .update(readFileSync(join(directory, fileName)))
    .digest("hex");
}

describe("public alpha screenshot tour", () => {
  it("contains the exact ten-frame website gallery with expected dimensions", () => {
    if (!websiteGalleryPresent) {
      const tour = readFileSync(join(process.cwd(), "docs", "tour.md"), "utf8");
      expect(tour).toContain("does not currently include screenshots");
      expect(tour).toContain("Screenshot recapture is required before public alpha publication");
      return;
    }
    const actualFiles = readdirSync(websiteDirectory)
      .filter((fileName) => fileName.toLowerCase().endsWith(".png"))
      .sort();
    expect(actualFiles).toEqual([...expectedWebsiteGallery.keys()].sort());

    for (const [fileName, contract] of expectedWebsiteGallery) {
      expect(statSync(join(websiteDirectory, fileName)).size).toBeGreaterThan(10_000);
      const dimensions = pngDimensions(fileName);
      if ("width" in contract) expect(dimensions).toEqual(contract);
      else {
        expect(dimensions.width).toBeGreaterThanOrEqual(contract.minWidth);
        expect(dimensions.height).toBeGreaterThanOrEqual(contract.minHeight);
      }
    }
  });

  it("binds every website PNG to scenario, appearance, viewport, and browser provenance", () => {
    if (!websiteGalleryPresent) return;
    const manifest = JSON.parse(readFileSync(websiteManifestPath, "utf8")) as {
      schemaVersion: string;
      release: {
        webApplicationVersion: string;
        scientificBackendVersion: string;
        captureTool: { name: string; version: string };
      };
      captureBase: { revision: string; workingTree: string; boundary: string };
      frames: Array<{
        fileName: string;
        capturedAt: string;
        captureMode: string;
        scenario: string;
        appearance: string;
        viewport: { width: number; height: number };
        browser: { engine: string; version: string };
        png: { sha256: string; width: number; height: number };
        scientificEvidence?: Record<string, string>;
      }>;
    };
    expect(manifest.schemaVersion).toBe("website-screenshot-provenance-v2");
    expect(manifest.release).toEqual({
      webApplicationVersion: "0.2.0-alpha.1",
      scientificBackendVersion: "0.2.0-alpha.1",
      captureTool: { name: "@playwright/test", version: "1.61.1" },
    });
    expect(manifest.captureBase.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.captureBase.workingTree).toMatch(/^(clean|dirty)$/);
    expect(manifest.captureBase.boundary).toContain("does not attest");
    expect(manifest.frames.map((frame) => frame.fileName)).toEqual([...expectedWebsiteGallery.keys()]);
    expect(Object.fromEntries(manifest.frames.map((frame) => [frame.fileName, frame.captureMode]))).toEqual(
      expectedCaptureModes,
    );

    for (const frame of manifest.frames) {
      expect(Number.isNaN(Date.parse(frame.capturedAt))).toBe(false);
      expect(frame.scenario).not.toBe("");
      expect(frame.appearance).toMatch(/^(light|dark)$/);
      expect(frame.browser.engine).toMatch(/^(chromium|webkit)$/);
      expect(frame.browser.version).not.toBe("");
      expect(frame.png.sha256).toBe(sha256(frame.fileName));
      expect(frame.png).toMatchObject(pngDimensions(frame.fileName));
      expect(frame.viewport.width).toBeGreaterThan(0);
      expect(frame.viewport.height).toBeGreaterThan(0);
    }
    expect(manifest.frames.find((frame) => frame.fileName === "10-dark-education.png")?.appearance).toBe(
      "dark",
    );
  });

  it("identifies the Scientific result as deterministic contract replay evidence", () => {
    if (!websiteGalleryPresent) return;
    const manifest = JSON.parse(readFileSync(websiteManifestPath, "utf8")) as {
      frames: Array<{ fileName: string; scientificEvidence?: Record<string, string> }>;
    };
    expect(
      manifest.frames.find((frame) => frame.fileName === "07-scientific-result.png")?.scientificEvidence,
    ).toEqual({
      evidenceKind: "deterministic-contract-replay",
      fixture: "contracts/science-v5/contract-cases.json#validForwardResult",
      backendReleaseVersion: "0.2.0-alpha.1",
      pythonVersion: "3.14.6",
      scipyVersion: "1.18.0",
      pyarrowVersion: "25.0.0",
      declaredArrowArtifactSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      runStartedAt: "2026-07-16T00:00:00.000Z",
      runCompletedAt: "2026-07-16T00:00:01.000Z",
    });
  });

  it("links every website frame from the full tour and keeps README concise", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    const tour = readFileSync(join(process.cwd(), "docs", "tour.md"), "utf8");
    if (!websiteGalleryPresent) {
      expect(readme).toContain("Current Otherlight screenshots are not available");
      expect(readme).not.toContain("docs/screenshots/web/");
      expect(tour).toContain("Required browser captures");
      return;
    }
    for (const fileName of expectedWebsiteGallery.keys()) {
      expect(tour).toContain(`screenshots/web/${fileName}`);
    }
    expect(readme).toContain("docs/tour.md");
    expect(readme).toContain("docs/screenshots/web/01-education-simulation.png");
    expect(readme).toContain("docs/screenshots/web/07-scientific-result.png");
    expect(readme).toContain("docs/screenshots/web/10-dark-education.png");
  });

  it("documents every native frame after the exact Xcode 26.6 capture", () => {
    const tour = readFileSync(join(process.cwd(), "docs", "tour.md"), "utf8");
    if (!appleGalleryPresent) {
      expect(tour).toContain("Required native Apple captures");
      expect(tour).toContain("The native application is Education-only");
      return;
    }
    for (const fileName of expectedAppleGallery) {
      expect(tour).toContain(`screenshots/apple/${fileName}`);
    }
  });

  it("validates every native image and its exact Apple capture provenance when present", () => {
    const manifestPath = appleManifestPath;
    if (!appleGalleryPresent) return;

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      schemaVersion: string;
      toolchain: { xcode: string; xcodeBuild: string; swift: string; captureTool: string };
      sdks: { macOS: string; iOSSimulator: string };
      captureBase: { revision: string; workingTree: string; boundary: string };
      frames: Array<{
        fileName: string;
        platform: string;
        device: string;
        appearance: string;
        captureTool: string;
        capturedAt: string;
        runtime: { version: string; build: string; name?: string; identifier?: string };
        png: { sha256: string; width: number; height: number };
      }>;
    };
    const pngFiles = readdirSync(appleDirectory)
      .filter((fileName) => fileName.endsWith(".png"))
      .sort();
    expect(pngFiles).toEqual([...expectedAppleGallery].sort());
    expect(manifest.schemaVersion).toBe("apple-screenshot-provenance-v2");
    expect(manifest.toolchain.xcode).toBe("Xcode 26.6");
    expect(manifest.toolchain.xcodeBuild).toBe("Build version 17F113");
    expect(manifest.toolchain.swift).toContain("Swift version 6.3.3");
    expect(manifest.toolchain.captureTool).toBe("hybrid native app-surface capture");
    expect(manifest.sdks).toEqual({ macOS: "26.5", iOSSimulator: "26.5" });
    expect(manifest.captureBase.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.captureBase.workingTree).toMatch(/^(clean|dirty)$/);
    expect(manifest.captureBase.boundary).toContain("does not attest");
    expect(manifest.frames.map((frame) => frame.fileName)).toEqual(expectedAppleGallery);

    for (const frame of manifest.frames) {
      const imagePath = join(appleDirectory, frame.fileName);
      const bytes = readFileSync(imagePath);
      expect(bytes.subarray(0, pngSignature.length)).toEqual(pngSignature);
      expect(statSync(imagePath).size).toBeGreaterThan(10_000);
      expect(frame.png.sha256).toBe(gallerySha256(appleDirectory, frame.fileName));
      expect(frame.png.width).toBeGreaterThan(300);
      expect(frame.png.height).toBeGreaterThan(300);
      expect(frame.runtime.version).not.toBe("");
      expect(frame.runtime.build).not.toBe("");
      expect(frame.captureTool).toBe(
        frame.platform === "macOS" ? "macOS app-window capture" : "XCUITest app-surface attachment",
      );
      expect(Number.isNaN(Date.parse(frame.capturedAt))).toBe(false);
    }

    const tour = readFileSync(join(process.cwd(), "docs", "tour.md"), "utf8");
    for (const fileName of expectedAppleGallery) expect(tour).toContain(`screenshots/apple/${fileName}`);
  });
});
