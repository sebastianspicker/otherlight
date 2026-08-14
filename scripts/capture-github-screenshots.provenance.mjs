/* global console */
/** Validates screenshot bytes and writes the stable release-gallery provenance manifest. */

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gitCaptureBoundary } from "./capture-git-boundary.mjs";
import {
  canonicalManifestPath,
  expectedGallery,
  legacyManifestPath,
  manifestFileName,
  pngSignature,
  root,
  screenshotDir,
} from "./capture-github-screenshots.config.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngDimensions(bytes, fileName) {
  if (bytes.length < 24 || !bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error(`${fileName} is not a valid PNG file`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function readExistingManifest() {
  const canonical = await readJsonIfPresent(canonicalManifestPath);
  if (canonical !== undefined) return canonical;
  return (await readJsonIfPresent(legacyManifestPath)) ?? null;
}

export function scientificEvidenceFromResult(resultText, artifactBytes) {
  const result = JSON.parse(resultText);
  const manifest = result?.runManifest;
  const artifactDigest = sha256(artifactBytes);
  if (
    !manifest ||
    artifactDigest !== result.arrowArtifactId ||
    artifactDigest !== manifest.artifact?.idSha256
  ) {
    throw new Error("Downloaded Arrow artifact digest does not match the Scientific run provenance");
  }
  return {
    backendReleaseVersion: manifest.implementation.application.version,
    pythonVersion: manifest.implementation.runtime.version,
    scipyVersion: manifest.implementation.engine.version,
    pyarrowVersion: manifest.implementation.artifactWriter.version,
    arrowArtifactSha256: artifactDigest,
    runStartedAt: manifest.startedAt,
    runCompletedAt: manifest.completedAt,
  };
}

export async function writeReleaseGalleryManifest(captures) {
  const existing = await readExistingManifest();
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const frames = [];
  for (const [fileName] of expectedGallery) {
    const bytes = await readFile(path.join(screenshotDir, fileName));
    const { width, height } = pngDimensions(bytes, fileName);
    const previous =
      existing?.frames?.find((frame) => frame.fileName === fileName) ??
      (fileName === "07-scientific-result.png"
        ? existing?.frames?.find((frame) => frame.fileName === "06-scientific-result.png")
        : undefined);
    const capture = captures.get(fileName) ?? previous;
    if (!capture) throw new Error(`Missing capture provenance for ${fileName}`);
    frames.push({
      fileName,
      capturedAt: capture.capturedAt,
      captureMode: capture.captureMode,
      browser: capture.browser,
      png: { sha256: sha256(bytes), width, height },
      scenario: capture.scenario ?? "scientific-result",
      appearance: capture.appearance ?? "dark",
      viewport: capture.viewport ?? { width, height },
      ...(capture.scientificEvidence ? { scientificEvidence: capture.scientificEvidence } : {}),
    });
  }
  const preservedScientific = frames.find((frame) => frame.fileName === "07-scientific-result.png");
  if (!preservedScientific?.scientificEvidence) {
    throw new Error("07-scientific-result.png requires Scientific artifact provenance");
  }
  const manifest = {
    schemaVersion: "website-screenshot-provenance-v2",
    release: {
      webApplicationVersion: packageJson.version,
      scientificBackendVersion: preservedScientific.scientificEvidence.backendReleaseVersion,
      captureTool: { name: "@playwright/test", version: packageJson.devDependencies["@playwright/test"] },
    },
    captureBase: await gitCaptureBoundary(
      root,
      "Capture-time Git provenance only; this does not attest to a later release candidate or its working tree.",
    ),
    frames,
  };
  await writeFile(path.join(screenshotDir, manifestFileName), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[capture] wrote ${manifestFileName}`);
}

export async function validateReleaseGallery() {
  const actualFiles = (await readdir(screenshotDir))
    .filter((fileName) => fileName.toLowerCase().endsWith(".png"))
    .sort();
  const expectedFiles = [...expectedGallery.keys()].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `Release gallery must contain exactly ${expectedFiles.join(", ")}; found ${actualFiles.join(", ")}`,
    );
  }
  for (const [fileName, contract] of expectedGallery) {
    const bytes = await readFile(path.join(screenshotDir, fileName));
    if (bytes.length < 10_000) throw new Error(`${fileName} is unexpectedly small (${bytes.length} bytes)`);
    const { width, height } = pngDimensions(bytes, fileName);
    if ("width" in contract && (width !== contract.width || height !== contract.height)) {
      throw new Error(`${fileName} must be ${contract.width}x${contract.height}; found ${width}x${height}`);
    }
    if ("minWidth" in contract && (width < contract.minWidth || height < contract.minHeight)) {
      throw new Error(
        `${fileName} must be at least ${contract.minWidth}x${contract.minHeight}; found ${width}x${height}`,
      );
    }
  }
  console.log(`[capture] validated ${expectedFiles.length}-image public release gallery`);
}
