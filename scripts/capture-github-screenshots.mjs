/* global fetch, setTimeout, console, process, document, HTMLSelectElement, HTMLDetailsElement, Event, HTMLInputElement, HTMLButtonElement */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASE_URL = "http://127.0.0.1:4175";
const HERO_DIR = path.join(ROOT, "docs/media/github");
const SCREENSHOT_DIR = path.join(ROOT, "docs/screenshots");
const VITE_BIN = path.join(ROOT, "node_modules", ".bin", "vite");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(timeoutMs = 120_000) {
  console.log(`[capture] waiting for dev server at ${BASE_URL}`);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(BASE_URL, { redirect: "manual" });
      if (res.ok) return;
    } catch {
      // server not ready yet
    }
    await sleep(500);
  }
  throw new Error(`capture-github-screenshots: dev server did not become ready at ${BASE_URL}`);
}

async function withDevServer(fn) {
  const child = spawn(VITE_BIN, ["--host", "127.0.0.1", "--strictPort", "--port", "4175"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  child.stdout.on("data", (chunk) => process.stdout.write(String(chunk)));
  child.stderr.on("data", (chunk) => process.stderr.write(String(chunk)));

  try {
    await waitForServer();
    console.log("[capture] dev server ready");
    return await fn();
  } finally {
    if (!child.killed) child.kill("SIGTERM");
    await new Promise((resolve) => {
      child.once("exit", () => resolve(undefined));
      setTimeout(resolve, 1500);
    });
  }
}

async function waitForApp(page) {
  console.log("[capture] loading app");
  await page.goto(BASE_URL, { waitUntil: "load" });
  await page.waitForSelector("#presetSelect");
  await page.waitForFunction(() => {
    const presetSelect = document.querySelector("#presetSelect");
    return presetSelect instanceof HTMLSelectElement && presetSelect.options.length > 0;
  });
  await page.waitForSelector("#skyCanvas");
  await sleep(400);
  console.log("[capture] app ready");
}

async function setSelect(page, selector, value) {
  await page.selectOption(selector, value);
  await sleep(350);
}

async function openContainingDetails(page, selector) {
  await page.locator(selector).evaluate((node) => {
    const details = node.closest("details");
    if (details instanceof HTMLDetailsElement) details.open = true;
  });
  await sleep(120);
}

async function setDomSelect(page, selector, value) {
  await page.locator(selector).evaluate((node, nextValue) => {
    if (!(node instanceof HTMLSelectElement)) return;
    node.value = String(nextValue);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await sleep(220);
}

async function setDomNumber(page, selector, value) {
  await page.locator(selector).evaluate((node, nextValue) => {
    if (!(node instanceof HTMLInputElement)) return;
    node.value = String(nextValue);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await sleep(120);
}

async function resetTime(page) {
  await page.locator("#btnReset").click();
  await sleep(500);
}

async function setSimulationState(page, args) {
  await setSelect(page, "#productModeSelect", "simulation");
  const uiMode = simulationUiMode(args);
  await setSelect(page, "#uiModeSelect", uiMode);
  await setRuntimeModeForExpert(page, args, uiMode);
  await setSelect(page, "#presetSelect", args.presetId);
  await setSelect(page, "#plotMode", plotMode(args));
  await setSelect(page, "#plotTrackingMode", trackingMode(args));
  await resetTime(page);
}

function simulationUiMode(args) {
  return args.uiMode ?? "normal";
}

function plotMode(args) {
  return args.plotMode ?? "physical";
}

function trackingMode(args) {
  return args.trackingMode ?? "fixed";
}

async function setRuntimeModeForExpert(page, args, uiMode) {
  if (uiMode !== "expert") return;
  await setSelect(page, "#runtimeModeSelect", args.runtimeMode ?? "realtime");
}

async function captureSet() {
  await ensureScreenshotDirs();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1500 } });
  try {
    await waitForApp(page);
    await captureSimulationScreens(page);
    await captureLabScreens(page);
    console.log("[capture] done");
  } finally {
    await browser.close();
  }
}

async function ensureScreenshotDirs() {
  await mkdir(HERO_DIR, { recursive: true });
  await mkdir(SCREENSHOT_DIR, { recursive: true });
}

async function captureSimulationScreens(page) {
  await captureMainSimulation(page);
  await captureSceneGeometry(page);
  await captureChromaticLane(page);
  await captureObserverContamination(page);
  await captureTimingDynamics(page);
}

async function captureLabScreens(page) {
  await captureCompareLab(page);
  await captureBinaryLab(page);
}

async function captureMainSimulation(page) {
  console.log("[capture] hero + main simulation");
  await setSimulationState(page, { presetId: "ec-geometry-ringed-planet" });
  await page.screenshot({ path: path.join(HERO_DIR, "hero-overview.png") });
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "01-main-simulation.png"),
    fullPage: true,
  });
  await page.locator("#lcCanvas").screenshot({
    path: path.join(SCREENSHOT_DIR, "02-light-curve-landmarks.png"),
  });
}

async function captureSceneGeometry(page) {
  console.log("[capture] scene geometry");
  await setSimulationState(page, { presetId: "ec-exomoon-separated" });
  await page.locator("#skyCanvas").screenshot({
    path: path.join(SCREENSHOT_DIR, "03-scene-geometry.png"),
  });
}

async function captureCompareLab(page) {
  console.log("[capture] compare lab");
  await setSimulationState(page, { presetId: "ec-geometry-ringed-planet" });
  await setSelect(page, "#productModeSelect", "lab");
  await setSelect(page, "#simModeSelect", "preset-lab");
  await triggerCompareLab(page);
  await page.locator(".mainGrid").screenshot({
    path: path.join(SCREENSHOT_DIR, "04-compare-lab.png"),
  });
}

async function triggerCompareLab(page) {
  await openContainingDetails(page, "#didCompareBtn");
  await setDomSelect(page, "#didComparePreset", "default");
  await setDomNumber(page, "#didCompareTime", 0);
  await page.locator("#didCompareBtn").evaluate((node) => {
    if (!(node instanceof HTMLButtonElement)) return;
    const details = node.closest("details");
    if (details instanceof HTMLDetailsElement) details.open = true;
    node.click();
  });
  await sleep(800);
}

async function captureChromaticLane(page) {
  console.log("[capture] chromatic lane");
  await setSimulationState(page, {
    presetId: "ec-atmosphere-spectral-contamination",
    plotMode: "measured",
  });
  await page.locator("#lcCanvas").screenshot({
    path: path.join(SCREENSHOT_DIR, "05-chromatic-lane.png"),
  });
}

async function captureObserverContamination(page) {
  console.log("[capture] observer contamination");
  await setSimulationState(page, {
    presetId: "ec-observer-telluric-absorption",
    plotMode: "measured",
  });
  await page.locator("#lcCanvas").screenshot({
    path: path.join(SCREENSHOT_DIR, "06-observer-contamination.png"),
  });
}

async function captureTimingDynamics(page) {
  console.log("[capture] timing dynamics");
  await setSimulationState(page, { presetId: "ec-relativity-clock-mismatch" });
  await page.locator(".vizStack").screenshot({
    path: path.join(SCREENSHOT_DIR, "07-timing-dynamics.png"),
  });
}

async function captureBinaryLab(page) {
  console.log("[capture] binary lab");
  await setSelect(page, "#productModeSelect", "lab");
  await setSelect(page, "#simModeSelect", "binary-lab");
  await sleep(500);
  await setSelect(page, "#didHypothesisSelect", "primary-eclipse-deepest");
  await page.locator("#didRevealSkyBtn").click();
  await sleep(500);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "08-binary-lab.png"),
    fullPage: true,
  });
}

await withDevServer(captureSet);
