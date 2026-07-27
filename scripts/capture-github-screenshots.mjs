/**
 * Captures and validates the curated public alpha gallery so documentation
 * shows reviewed product states rather than ad hoc local screenshots.
 */

/* global fetch, setTimeout, console, process, document, HTMLElement, HTMLSelectElement, URL */

import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gitCaptureBoundary } from "./capture-git-boundary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = "http://127.0.0.1:4173";
const screenshotDir = process.env.SCREENSHOT_DIR
  ? path.resolve(process.env.SCREENSHOT_DIR)
  : path.join(root, "docs/screenshots/web");
const canonicalScreenshotDir = path.join(root, "docs/screenshots/web");
const manifestFileName = "manifest.json";
const canonicalManifestPath = path.join(canonicalScreenshotDir, manifestFileName);
const legacyManifestPath = path.join(root, "docs/screenshots/manifest.json");
const scienceContractCasesPath = path.join(root, "contracts/science-v5/contract-cases.json");
const viteBin = path.join(root, "node_modules", ".bin", "vite");
const captureLiveScientificResult = process.argv.includes("--live-scientific");
const captureStaticBuild = process.argv.includes("--static-build");
const expectedGallery = new Map([
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
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const execFile = promisify(execFileCallback);
const pageProblems = new WeakMap();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(child, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Screenshot server exited before ${baseUrl} became ready (exit ${String(child.exitCode)}, signal ${String(child.signalCode)})`,
      );
    }
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await sleep(500);
  }
  throw new Error(`Screenshot server did not become ready at ${baseUrl}`);
}

async function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    sleep(timeoutMs).then(() => false),
  ]);
}

async function withDevServer(run) {
  if (captureStaticBuild) {
    await execFile(viteBin, ["build"], { cwd: root });
    return run();
  }
  const child = spawn(viteBin, ["--host", "127.0.0.1", "--strictPort", "--port", "4173"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  child.stdout.on("data", (chunk) => process.stdout.write(String(chunk)));
  child.stderr.on("data", (chunk) => process.stderr.write(String(chunk)));

  try {
    await waitForServer(child);
    return await run();
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    if (!(await waitForChildExit(child, 1_500))) {
      child.kill("SIGKILL");
      await waitForChildExit(child, 1_500);
    }
    child.stdout.destroy();
    child.stderr.destroy();
  }
}

const staticContentTypes = new Map([
  [".css", "text/css"],
  [".html", "text/html"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);

async function installStaticBuildRoute(page) {
  if (!captureStaticBuild) return;
  await page.route(`${baseUrl}/**`, async (route) => {
    const requestUrl = new URL(route.request().url());
    const requestedPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
    const distRoot = path.join(root, "dist");
    const filePath = path.resolve(distRoot, relativePath);
    if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${path.sep}`)) {
      await route.fulfill({ status: 403, body: "Forbidden" });
      return;
    }
    try {
      const body = await readFile(filePath);
      await route.fulfill({
        status: 200,
        contentType: staticContentTypes.get(path.extname(filePath)) ?? "application/octet-stream",
        body,
      });
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        await route.fulfill({ status: 404, body: "Not found" });
        return;
      }
      throw error;
    }
  });
}

async function waitForApp(page) {
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.locator("#app").waitFor();
  await page.locator("#presetSelect").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const preset = document.querySelector("#presetSelect");
    return preset instanceof HTMLSelectElement && preset.options.length > 1;
  });
  await page.locator("#main").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("#main")?.getAttribute("aria-busy") === "false");
  await sleep(400);
}

async function waitForScenario(page) {
  await page.locator("#main").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("#main")?.getAttribute("aria-busy") === "false");
  await sleep(300);
}

async function capture(page, fileName, metadata) {
  const canvasSnapshotProperty = "__releaseCaptureCanvasSnapshots";
  const problems = pageProblems.get(page) ?? [];
  if (problems.length > 0) {
    throw new Error(`${fileName} emitted browser errors before capture: ${problems.join(" | ")}`);
  }
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    globalThis.scrollTo({ top: 0, left: 0, behavior: "instant" });
  });
  await sleep(100);
  await page.evaluate(async (key) => {
    const pairs = [];
    for (const canvas of document.querySelectorAll("canvas")) {
      const image = document.createElement("img");
      for (const attribute of canvas.attributes) {
        image.setAttribute(attribute.name, attribute.value);
      }
      image.src = canvas.toDataURL("image/png");
      image.alt = canvas.getAttribute("aria-label") ?? "";
      image.decoding = "sync";

      const computed = globalThis.getComputedStyle(canvas);
      for (const property of computed) {
        image.style.setProperty(property, computed.getPropertyValue(property));
      }

      await image.decode();
      pairs.push({ canvas, image });
      canvas.replaceWith(image);
    }
    globalThis[key] = pairs;
    await new Promise((resolve) =>
      globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
    );
  }, canvasSnapshotProperty);

  try {
    // Flush any detached canvas layer left by the preceding workspace state;
    // the maintained frame is taken only after ordinary image layers settle.
    await page.screenshot({ caret: "hide" });
    await sleep(200);
    await page.screenshot({
      path: path.join(screenshotDir, fileName),
      caret: "hide",
    });
    console.log(`[capture] ${fileName}`);
    const browser = page.context().browser();
    return {
      ...metadata,
      capturedAt: new Date().toISOString(),
      captureMode: "scripted-browser",
      browser: {
        engine: browser?.browserType().name() ?? "unknown",
        version: browser?.version() ?? "unknown",
      },
      viewport: page.viewportSize(),
    };
  } finally {
    await page.evaluate((key) => {
      for (const { canvas, image } of globalThis[key] ?? []) image.replaceWith(canvas);
      delete globalThis[key];
    }, canvasSnapshotProperty);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readExistingManifest() {
  try {
    return JSON.parse(await readFile(canonicalManifestPath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      try {
        return JSON.parse(await readFile(legacyManifestPath, "utf8"));
      } catch (legacyError) {
        if (legacyError && typeof legacyError === "object" && legacyError.code === "ENOENT") return null;
        throw legacyError;
      }
    }
    throw error;
  }
}

function scientificEvidenceFromResult(resultText, artifactBytes) {
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

async function writeReleaseGalleryManifest(captures) {
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
      captureTool: {
        name: "@playwright/test",
        version: packageJson.devDependencies["@playwright/test"],
      },
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

function pngDimensions(bytes, fileName) {
  if (bytes.length < 24 || !bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error(`${fileName} is not a valid PNG file`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

async function validateReleaseGallery() {
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

async function mockScientificCapability(page) {
  await page.route("http://127.0.0.1:8765/v1/capabilities", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        schemaVersion: "v5",
        serviceVersion: "0.2.0-alpha.1-doc-fixture",
        generatedAt: "2026-07-16T12:00:00Z",
        supportedJobKinds: ["forward"],
        supportedOutputs: ["radial-velocity"],
        supportedSamplers: [],
        unavailableModelIds: [],
      }),
    });
  });
}

async function mockUnavailableScientificCapability(page) {
  await page.route("http://127.0.0.1:8765/v1/capabilities", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        schemaVersion: "v5",
        serviceVersion: "0.2.0-alpha.1-doc-fixture",
        generatedAt: "2026-07-16T12:00:00Z",
        supportedJobKinds: [],
        supportedOutputs: [],
        supportedSamplers: [],
        unavailableModelIds: ["radial-velocity"],
      }),
    });
  });
}

async function mockScientificContractResult(page) {
  const contractCases = JSON.parse(await readFile(scienceContractCasesPath, "utf8"));
  const result = contractCases.validForwardResult;
  const job = {
    id: result.runManifest.runId,
    kind: result.kind,
    state: "succeeded",
    submittedAt: result.runManifest.startedAt,
    updatedAt: result.runManifest.completedAt,
    progress: 1,
  };
  await page.route("http://127.0.0.1:8765/v1/jobs**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, accept",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const resultPath = `/v1/jobs/${encodeURIComponent(job.id)}/result`;
    const body = requestUrl.pathname === resultPath ? result : job;
    await route.fulfill({
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify(body),
    });
  });
  return result;
}

function scientificFixtureEvidence(result) {
  return {
    evidenceKind: "deterministic-contract-replay",
    fixture: "contracts/science-v5/contract-cases.json#validForwardResult",
    backendReleaseVersion: result.runManifest.implementation.application.version,
    pythonVersion: result.runManifest.implementation.runtime.version,
    scipyVersion: result.runManifest.implementation.engine.version,
    pyarrowVersion: result.runManifest.implementation.artifactWriter.version,
    declaredArrowArtifactSha256: result.arrowArtifactId,
    runStartedAt: result.runManifest.startedAt,
    runCompletedAt: result.runManifest.completedAt,
  };
}

async function openDesktopPage(
  browser,
  {
    scientificCapability = "live",
    colorScheme = "light",
    viewport = { width: 1440, height: 1000 },
    isMobile = false,
  } = {},
) {
  const page = await browser.newPage({ viewport, isMobile });
  const problems = [];
  pageProblems.set(page, problems);
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`page: ${error.message}`));
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme });
  await installStaticBuildRoute(page);
  if (scientificCapability === "ready") await mockScientificCapability(page);
  if (scientificCapability === "unavailable") await mockUnavailableScientificCapability(page);
  const scientificFixture =
    scientificCapability === "fixture-result" ? await mockScientificContractResult(page) : null;
  if (scientificFixture) await mockScientificCapability(page);
  await waitForApp(page);
  return { page, scientificFixture };
}

async function captureDesktop(browser) {
  const captures = new Map();
  let { page } = await openDesktopPage(browser);
  await page.locator("#presetSelect").selectOption("kepler-planet-only");
  await waitForScenario(page);
  await page.locator("#btnStart").click();
  await sleep(600);
  await page.locator("#btnStart").click();
  await sleep(200);
  captures.set(
    "01-education-simulation.png",
    await capture(page, "01-education-simulation.png", {
      scenario: "education-simulation",
      appearance: "dark",
    }),
  );
  await page.close();

  ({ page } = await openDesktopPage(browser));
  await page.locator("#presetSelect").selectOption("kepler-planet-only");
  await waitForScenario(page);
  await page.locator("#modeLabBtn").click();
  await waitForScenario(page);
  captures.set(
    "02-guided-lab.png",
    await capture(page, "02-guided-lab.png", { scenario: "guided-lab", appearance: "dark" }),
  );
  await page.close();

  ({ page } = await openDesktopPage(browser));
  await page.locator("#modeLabBtn").click();
  await waitForScenario(page);
  await page.locator("#simModeSelect").selectOption("binary-lab");
  await waitForScenario(page);
  captures.set(
    "03-binary-black-box.png",
    await capture(page, "03-binary-black-box.png", {
      scenario: "binary-black-box",
      appearance: "dark",
    }),
  );
  await page.close();

  ({ page } = await openDesktopPage(browser));
  await page.locator("#modeLabBtn").click();
  await waitForScenario(page);
  await page.locator("#simModeSelect").selectOption("binary-lab");
  await waitForScenario(page);
  await page.locator("#didHypothesisSelect").selectOption("primary-eclipse-deepest");
  await page.locator("#didRevealSkyBtn").click();
  await sleep(400);
  captures.set(
    "04-binary-revealed.png",
    await capture(page, "04-binary-revealed.png", {
      scenario: "binary-revealed",
      appearance: "dark",
    }),
  );
  await page.close();

  ({ page } = await openDesktopPage(browser, { scientificCapability: "unavailable" }));
  await page.locator("#presetSelect").selectOption("kepler-planet-only");
  await waitForScenario(page);
  await page.locator("#profileScientificBtn").click();
  await page.locator("#scienceRunBtn").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("#scienceRunBtn")?.hasAttribute("disabled"));
  await sleep(500);
  captures.set("05-scientific-unavailable.png", {
    ...(await capture(page, "05-scientific-unavailable.png", {
      scenario: "scientific-unavailable",
      appearance: "dark",
    })),
    captureMode: "scripted-mocked-scientific-unavailable",
  });
  await page.close();

  ({ page } = await openDesktopPage(browser, { scientificCapability: "ready" }));
  await page.locator("#presetSelect").selectOption("kepler-planet-only");
  await waitForScenario(page);
  await page.locator("#profileScientificBtn").click();
  await page.locator("#scienceRunBtn").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("#scienceRunBtn")?.hasAttribute("disabled"));
  await sleep(500);
  captures.set("06-scientific-ready.png", {
    ...(await capture(page, "06-scientific-ready.png", {
      scenario: "scientific-ready",
      appearance: "dark",
    })),
    captureMode: "scripted-mocked-scientific-capability",
  });
  await page.close();

  if (captureLiveScientificResult) {
    // The live result must not share the route-mocked capability page used for
    // the deterministic documentation fixture above.
    ({ page } = await openDesktopPage(browser));
    await page.locator("#presetSelect").selectOption("kepler-planet-only");
    await waitForScenario(page);
    await page.locator("#profileScientificBtn").click();
    await page.locator("#scienceRunBtn").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector("#scienceRunBtn")?.hasAttribute("disabled"));
    await page.locator("#scienceDurationHours").fill("0.05");
    await page.locator("#scienceCadenceSec").fill("30");
    await page.locator("#scienceSeed").fill("7");
    await page.locator("#scienceRunBtn").click();
    await page.locator("#scienceArtifactLink").waitFor({ state: "visible", timeout: 120_000 });
    const [resultText, artifactHref] = await Promise.all([
      page.locator("#scienceResult").textContent(),
      page.locator("#scienceArtifactLink").getAttribute("href"),
    ]);
    if (!resultText || !artifactHref)
      throw new Error("Live Scientific result did not expose provenance and Arrow artifact");
    const artifactBytes = Buffer.from(
      await page.evaluate(
        async (href) => Array.from(new Uint8Array(await (await fetch(href)).arrayBuffer())),
        artifactHref,
      ),
    );
    await page.locator("#scientificWorkspace").screenshot({
      path: path.join(screenshotDir, "07-scientific-result.png"),
    });
    captures.set("07-scientific-result.png", {
      scenario: "scientific-result",
      appearance: "dark",
      viewport: page.viewportSize(),
      capturedAt: new Date().toISOString(),
      captureMode: "live-scientific-backend",
      browser: {
        engine: browser.browserType().name(),
        version: browser.version(),
      },
      scientificEvidence: scientificEvidenceFromResult(resultText, artifactBytes),
    });
    console.log("[capture] 07-scientific-result.png (live backend)");
  } else {
    let scientificFixture;
    ({ page, scientificFixture } = await openDesktopPage(browser, {
      scientificCapability: "fixture-result",
    }));
    await page.locator("#presetSelect").selectOption("kepler-planet-only");
    await waitForScenario(page);
    await page.locator("#profileScientificBtn").click();
    await page.locator("#scienceRunBtn").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector("#scienceRunBtn")?.hasAttribute("disabled"));
    await page.locator("#scienceRunBtn").click();
    await page.locator("#scienceArtifactLink").waitFor({ state: "visible" });
    captures.set("07-scientific-result.png", {
      ...(await capture(page, "07-scientific-result.png", {
        scenario: "scientific-contract-result",
        appearance: "dark",
      })),
      captureMode: "scripted-contract-result",
      scientificEvidence: scientificFixtureEvidence(scientificFixture),
    });
    await page.close();
    console.log("[capture] 07-scientific-result.png (deterministic contract replay)");
  }

  ({ page } = await openDesktopPage(browser, { colorScheme: "dark" }));
  await page.locator("#presetSelect").selectOption("kepler-planet-only");
  await waitForScenario(page);
  captures.set(
    "10-dark-education.png",
    await capture(page, "10-dark-education.png", {
      scenario: "education-dark-hero",
      appearance: "dark",
    }),
  );
  await page.close();

  return captures;
}

async function captureResponsive(browser, { fileName, viewport, isMobile, scenario, captureMode }) {
  const { page } = await openDesktopPage(browser, { viewport, isMobile });
  const captureMetadata = await capture(page, fileName, { scenario, appearance: "dark" });
  await page.close();
  return { ...captureMetadata, captureMode };
}

async function captureTablet(browser) {
  return captureResponsive(browser, {
    fileName: "08-tablet-education.png",
    viewport: { width: 1024, height: 768 },
    isMobile: false,
    scenario: "tablet-education",
    captureMode: "scripted-browser-tablet",
  });
}

async function captureMobile(browser) {
  return captureResponsive(browser, {
    fileName: "09-mobile-education.png",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    scenario: "mobile-education",
    captureMode: "scripted-browser-mobile",
  });
}

async function captureReleaseGallery() {
  await mkdir(screenshotDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  try {
    const captures = await captureDesktop(browser);
    captures.set("08-tablet-education.png", await captureTablet(browser));
    captures.set("09-mobile-education.png", await captureMobile(browser));
    await validateReleaseGallery();
    await writeReleaseGalleryManifest(captures);
  } finally {
    await browser.close();
  }
}

await withDevServer(captureReleaseGallery);
