/** Builds and HTTP-smokes the real Browser app at its GitHub Pages repository base. */

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const host = process.env.SMOKE_PAGES_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.SMOKE_PAGES_PORT ?? "4174", 10);
const basePath = "/otherlight/";
const origin = `http://${host}:${port}`;
const pagesUrl = `${origin}${basePath}`;
const previewStopTimeoutMs = 5_000;

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`SMOKE_PAGES_PORT must be a valid TCP port, received ${port}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status === 0) return;
  const outcome = result.signal ?? `code ${result.status}`;
  throw new Error(`${command} ${args.join(" ")} exited with ${outcome}`);
}

function startPreview() {
  const logs = [];
  const child = spawn("pnpm", ["preview:pages", "--host", host, "--port", String(port), "--strictPort"], {
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const capture = (buffer) => logs.push(buffer.toString());
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  return { child, logs };
}

function previewHasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function signalPreview(child, signal) {
  if (previewHasExited(child) || child.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") throw error;
  }
}

function waitForPreviewExit(child, timeoutMs) {
  if (previewHasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onExit = () => finish(true);
    const timer = globalThis.setTimeout(() => finish(false), timeoutMs);
    const finish = (exited) => {
      globalThis.clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    child.once("exit", onExit);
  });
}

async function stopPreview(child) {
  signalPreview(child, "SIGTERM");
  if (await waitForPreviewExit(child, previewStopTimeoutMs)) return;
  signalPreview(child, "SIGKILL");
  if (!(await waitForPreviewExit(child, previewStopTimeoutMs))) {
    throw new Error("Pages preview process group did not stop after SIGKILL.");
  }
}

function findAssetPaths(html, attribute) {
  return [...html.matchAll(new RegExp(`${attribute}=["']([^"']+)["']`, "g"))].map((match) => match[1]);
}

function assertPagesPath(pathname, label) {
  assert.ok(pathname.startsWith(basePath), `${label} must resolve below ${basePath}: ${pathname}`);
  assert.ok(!pathname.startsWith("//"), `${label} must not be protocol-relative: ${pathname}`);
}

function assertNoOriginRootAssetReference(source, label) {
  const originRootReference =
    /(?:src|href)\s*[:=]\s*["']\/(?!otherlight\/)|url\(\s*["']?\/(?!otherlight\/)/i.exec(source);
  assert.equal(
    originRootReference,
    null,
    `${label} contains an origin-root asset reference: ${originRootReference?.[0]}`,
  );
}

async function fetchUntilReady(server, logs) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (previewHasExited(server)) {
      throw new Error(`Pages preview exited before becoming ready:\n${logs.join("")}`);
    }
    try {
      const response = await globalThis.fetch(pagesUrl);
      if (response.ok) {
        return response;
      }
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 200));
  }
  throw new Error(`Pages preview did not become ready at ${pagesUrl}:\n${logs.join("")}`);
}

async function fetchAsset(pathname, label) {
  assertPagesPath(pathname, label);
  const response = await globalThis.fetch(`${origin}${pathname}`);
  assert.equal(response.status, 200, `${label} did not resolve: ${pathname}`);
  return response;
}

function assertContentType(response, expected, label) {
  assert.match(
    response.headers.get("content-type") ?? "",
    expected,
    `${label} has an unexpected content type`,
  );
}

function assertPagesCsp(html) {
  const cspMetaTag = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => /http-equiv="Content-Security-Policy"/i.test(tag));
  const pagesCsp = cspMetaTag?.match(/content="([^"]*)"/i)?.[1];
  assert.ok(pagesCsp, "Pages HTML is missing its Content-Security-Policy meta tag");
  const cspIndex = html.indexOf(cspMetaTag);
  const firstResourceIndex = Math.min(
    ...[html.search(/<script\b/i), html.search(/<link\b/i)].filter((index) => index >= 0),
  );
  assert.ok(
    cspIndex >= 0 && cspIndex < firstResourceIndex,
    "Pages CSP meta tag must precede every script and link resource",
  );
  assert.match(
    pagesCsp,
    /connect-src (?:'|&#39;)self(?:'|&#39;)/,
    "Pages CSP must restrict connections to self",
  );
  assert.doesNotMatch(pagesCsp, /127\.0\.0\.1|localhost|\bws:/i, "Pages CSP must not permit loopback or HMR");
}

function inspectPageDocument(html) {
  assert.match(html, /id="appShellRoot"/, "Pages shell is missing its application mount point");
  assertNoOriginRootAssetReference(html, "Pages HTML");
  assertPagesCsp(html);
  const scriptPaths = findAssetPaths(html, "src").filter((pathname) => pathname.endsWith(".js"));
  const stylePaths = findAssetPaths(html, "href").filter((pathname) => pathname.endsWith(".css"));
  const faviconPath = findAssetPaths(html, "href").find((pathname) => pathname.endsWith("favicon.svg"));
  assert.ok(scriptPaths.length > 0, "Pages HTML does not reference a Browser JavaScript chunk");
  assert.ok(stylePaths.length > 0, "Pages HTML does not reference a Browser stylesheet");
  assert.equal(
    faviconPath,
    `${basePath}favicon.svg`,
    "Pages HTML must resolve the favicon below the repository base",
  );
  return { scriptPaths, stylePaths, faviconPath };
}

async function fetchPageAssets({ scriptPaths, stylePaths, faviconPath }) {
  const chunkSources = await Promise.all(
    scriptPaths.map(async (pathname) => {
      const response = await fetchAsset(pathname, "Browser JavaScript chunk");
      assertContentType(response, /(?:text|application)\/javascript/i, "Browser JavaScript chunk");
      return response.text();
    }),
  );
  const styleSources = await Promise.all(
    stylePaths.map(async (pathname) => {
      const response = await fetchAsset(pathname, "Browser stylesheet");
      assertContentType(response, /text\/css/i, "Browser stylesheet");
      return response.text();
    }),
  );
  const faviconResponse = await fetchAsset(faviconPath, "Browser favicon");
  assertContentType(faviconResponse, /image\/svg\+xml/i, "Browser favicon");
  return { chunkSources, styleSources };
}

async function assertPageAssetReferences(chunkSources, styleSources) {
  for (const source of chunkSources) assertNoOriginRootAssetReference(source, "Browser JavaScript chunk");
  for (const source of styleSources) assertNoOriginRootAssetReference(source, "Browser stylesheet");
  // The shell renders an inline brand mark, so the shipped brand file is verified
  // by availability rather than by a bundle reference.
  const brandPath = `${basePath}brand/otherlight-signal-eclipse.svg`;
  const brandResponse = await fetchAsset(brandPath, "Browser brand");
  assertContentType(brandResponse, /image\/svg\+xml/i, "Browser brand");
}

const TOUR_IMAGES = ["01-education-simulation.png", "02-guided-lab.png", "03-scientific-replay.png"];

async function assertScreenshotTour() {
  const tourUrl = `${pagesUrl}demo/`;
  const response = await globalThis.fetch(tourUrl);
  assert.equal(response.status, 200, `Screenshot tour did not resolve: ${tourUrl}`);
  assertContentType(response, /text\/html/i, "Screenshot tour");
  const html = await response.text();
  assert.match(html, /Screenshot tour/, "Screenshot tour is missing its heading");
  assertNoOriginRootAssetReference(html, "Screenshot tour HTML");
  assert.ok(
    html.includes("./assets/otherlight-signal-eclipse.svg"),
    "Screenshot tour does not reference the brand asset",
  );
  for (const image of TOUR_IMAGES) {
    assert.ok(html.includes(`./assets/${image}`), `Screenshot tour does not reference ${image}`);
    const imageResponse = await fetchAsset(`${basePath}demo/assets/${image}`, `Tour image ${image}`);
    assertContentType(imageResponse, /image\/png/i, `Tour image ${image}`);
  }
}

async function runSmokeTransaction(server, logs) {
  const indexResponse = await fetchUntilReady(server, logs);
  const html = await indexResponse.text();
  const assets = inspectPageDocument(html);
  const { chunkSources, styleSources } = await fetchPageAssets(assets);
  await assertPageAssetReferences(chunkSources, styleSources);
  await assertScreenshotTour();
  run("node", ["scripts/check-worker-asset.mjs", pagesUrl]);
}

run("pnpm", ["build:pages:site"]);

const { child: server, logs } = startPreview();
try {
  await runSmokeTransaction(server, logs);
} finally {
  await stopPreview(server);
}
