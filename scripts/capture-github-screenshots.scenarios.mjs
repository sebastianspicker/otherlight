/* global document, console, fetch, setTimeout, URL */
/** Captures the ordered education, guided-lab, binary, and scientific gallery scenarios. */

import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  captureLiveScientificResult,
  scienceContractCasesPath,
  screenshotDir,
} from "./capture-github-screenshots.config.mjs";
import { capture, openDesktopPage, waitForScenario } from "./capture-github-screenshots.page.mjs";
import {
  scientificEvidenceFromResult,
  validateReleaseGallery,
  writeReleaseGalleryManifest,
} from "./capture-github-screenshots.provenance.mjs";

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

async function openScenarioPage(browser, options = {}) {
  return openDesktopPage(browser, options, async (page, scientificCapability) => {
    if (scientificCapability === "ready") await mockScientificCapability(page);
    if (scientificCapability === "unavailable") await mockUnavailableScientificCapability(page);
    const scientificFixture =
      scientificCapability === "fixture-result" ? await mockScientificContractResult(page) : null;
    if (scientificFixture) await mockScientificCapability(page);
    return scientificFixture;
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureScenario(page, fileName, scenario) {
  return capture(page, fileName, { scenario, appearance: "dark" });
}

async function captureEducationScenarios(browser, captures) {
  let { page } = await openScenarioPage(browser);
  await page.locator("#presetSelect").selectOption("kepler-planet-only");
  await waitForScenario(page);
  await page.locator("#btnStart").click();
  await sleep(600);
  await page.locator("#btnStart").click();
  await sleep(200);
  captures.set(
    "01-education-simulation.png",
    await captureScenario(page, "01-education-simulation.png", "education-simulation"),
  );
  await page.close();

  ({ page } = await openScenarioPage(browser));
  await page.locator("#presetSelect").selectOption("kepler-planet-only");
  await waitForScenario(page);
  await page.locator("#modeLabBtn").click();
  await waitForScenario(page);
  captures.set("02-guided-lab.png", await captureScenario(page, "02-guided-lab.png", "guided-lab"));
  await page.close();

  ({ page } = await openScenarioPage(browser));
  await page.locator("#modeLabBtn").click();
  await waitForScenario(page);
  await page.locator("#simModeSelect").selectOption("binary-lab");
  await waitForScenario(page);
  captures.set(
    "03-binary-black-box.png",
    await captureScenario(page, "03-binary-black-box.png", "binary-black-box"),
  );
  await page.close();

  ({ page } = await openScenarioPage(browser));
  await page.locator("#modeLabBtn").click();
  await waitForScenario(page);
  await page.locator("#simModeSelect").selectOption("binary-lab");
  await waitForScenario(page);
  await page.locator("#didHypothesisSelect").selectOption("primary-eclipse-deepest");
  await page.locator("#didRevealSkyBtn").click();
  await sleep(400);
  captures.set(
    "04-binary-revealed.png",
    await captureScenario(page, "04-binary-revealed.png", "binary-revealed"),
  );
  await page.close();
}

async function captureScientificCapabilityScenarios(browser, captures) {
  let { page } = await openScenarioPage(browser, { scientificCapability: "unavailable" });
  await page.locator("#presetSelect").selectOption("kepler-planet-only");
  await waitForScenario(page);
  await page.locator("#profileScientificBtn").click();
  await page.locator("#scienceRunBtn").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("#scienceRunBtn")?.hasAttribute("disabled"));
  await sleep(500);
  captures.set("05-scientific-unavailable.png", {
    ...(await captureScenario(page, "05-scientific-unavailable.png", "scientific-unavailable")),
    captureMode: "scripted-mocked-scientific-unavailable",
  });
  await page.close();

  ({ page } = await openScenarioPage(browser, { scientificCapability: "ready" }));
  await page.locator("#presetSelect").selectOption("kepler-planet-only");
  await waitForScenario(page);
  await page.locator("#profileScientificBtn").click();
  await page.locator("#scienceRunBtn").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("#scienceRunBtn")?.hasAttribute("disabled"));
  await sleep(500);
  captures.set("06-scientific-ready.png", {
    ...(await captureScenario(page, "06-scientific-ready.png", "scientific-ready")),
    captureMode: "scripted-mocked-scientific-capability",
  });
  await page.close();
}

async function captureScientificResult(browser, captures) {
  if (captureLiveScientificResult) {
    const { page } = await openScenarioPage(browser);
    try {
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
      if (!resultText || !artifactHref) {
        throw new Error("Live Scientific result did not expose provenance and Arrow artifact");
      }
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
        browser: { engine: browser.browserType().name(), version: browser.version() },
        scientificEvidence: scientificEvidenceFromResult(resultText, artifactBytes),
      });
      console.log("[capture] 07-scientific-result.png (live backend)");
    } finally {
      await page.close();
    }
    return;
  }

  const { page, scientificFixture } = await openScenarioPage(browser, {
    scientificCapability: "fixture-result",
  });
  try {
    await page.locator("#presetSelect").selectOption("kepler-planet-only");
    await waitForScenario(page);
    await page.locator("#profileScientificBtn").click();
    await page.locator("#scienceRunBtn").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector("#scienceRunBtn")?.hasAttribute("disabled"));
    await page.locator("#scienceRunBtn").click();
    await page.locator("#scienceArtifactLink").waitFor({ state: "visible" });
    captures.set("07-scientific-result.png", {
      ...(await captureScenario(page, "07-scientific-result.png", "scientific-contract-result")),
      captureMode: "scripted-contract-result",
      scientificEvidence: scientificFixtureEvidence(scientificFixture),
    });
    console.log("[capture] 07-scientific-result.png (deterministic contract replay)");
  } finally {
    await page.close();
  }
}

async function captureDarkEducationScenario(browser, captures) {
  const { page } = await openScenarioPage(browser, { colorScheme: "dark" });
  await page.locator("#presetSelect").selectOption("kepler-planet-only");
  await waitForScenario(page);
  captures.set(
    "10-dark-education.png",
    await captureScenario(page, "10-dark-education.png", "education-dark-hero"),
  );
  await page.close();
}

async function captureDesktop(browser) {
  const captures = new Map();
  await captureEducationScenarios(browser, captures);
  await captureScientificCapabilityScenarios(browser, captures);
  await captureScientificResult(browser, captures);
  await captureDarkEducationScenario(browser, captures);
  return captures;
}

async function captureResponsive(browser, { fileName, viewport, isMobile, scenario, captureMode }) {
  const { page } = await openScenarioPage(browser, { viewport, isMobile });
  const captureMetadata = await captureScenario(page, fileName, scenario);
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

export async function captureReleaseGallery() {
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
