/* global process */
/** Resolves the screenshot CLI contract, paths, flags, and ordered frame configuration. */

import { Buffer } from "node:buffer";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const baseUrl = "http://127.0.0.1:4173";
export const screenshotDir = process.env.SCREENSHOT_DIR
  ? path.resolve(process.env.SCREENSHOT_DIR)
  : path.join(root, "docs/screenshots/web");
const canonicalScreenshotDir = path.join(root, "docs/screenshots/web");
export const manifestFileName = "manifest.json";
export const canonicalManifestPath = path.join(canonicalScreenshotDir, manifestFileName);
export const legacyManifestPath = path.join(root, "docs/screenshots/manifest.json");
export const scienceContractCasesPath = path.join(root, "contracts/science-v5/contract-cases.json");
export const viteBin = path.join(root, "node_modules", ".bin", "vite");
export const captureLiveScientificResult = process.argv.includes("--live-scientific");
export const captureStaticBuild = process.argv.includes("--static-build");
export const expectedGallery = new Map([
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
export const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
