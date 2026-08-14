/* global document, HTMLElement, HTMLSelectElement, setTimeout, console */
/** Drives deterministic browser navigation, app readiness, and frame capture. */

import path from "node:path";
import { baseUrl, screenshotDir } from "./capture-github-screenshots.config.mjs";
import { installStaticBuildRoute } from "./capture-github-screenshots.server.mjs";

const pageProblems = new WeakMap();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export async function waitForScenario(page) {
  await page.locator("#main").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("#main")?.getAttribute("aria-busy") === "false");
  await sleep(300);
}

export async function capture(page, fileName, metadata) {
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
      for (const attribute of canvas.attributes) image.setAttribute(attribute.name, attribute.value);
      image.src = canvas.toDataURL("image/png");
      image.alt = canvas.getAttribute("aria-label") ?? "";
      image.decoding = "sync";

      const computed = globalThis.getComputedStyle(canvas);
      for (const property of computed) image.style.setProperty(property, computed.getPropertyValue(property));

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
    // Flush any detached canvas layer left by the preceding workspace state.
    await page.screenshot({ caret: "hide" });
    await sleep(200);
    await page.screenshot({ path: path.join(screenshotDir, fileName), caret: "hide" });
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

export async function openDesktopPage(browser, options = {}, configureScientific = async () => null) {
  const {
    scientificCapability = "live",
    colorScheme = "light",
    viewport = { width: 1440, height: 1000 },
    isMobile = false,
  } = options;
  const page = await browser.newPage({ viewport, isMobile });
  const problems = [];
  pageProblems.set(page, problems);
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`page: ${error.message}`));
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme });
  await installStaticBuildRoute(page);
  const scientificFixture = await configureScientific(page, scientificCapability);
  await waitForApp(page);
  return { page, scientificFixture };
}
