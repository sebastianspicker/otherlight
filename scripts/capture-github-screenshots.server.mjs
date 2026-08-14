/* global fetch, setTimeout, process, URL */
/** Owns Vite/static server startup, readiness, routing, and guaranteed cleanup. */

import { execFile as execFileCallback, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { baseUrl, captureStaticBuild, root, viteBin } from "./capture-github-screenshots.config.mjs";

const execFile = promisify(execFileCallback);
const staticContentTypes = new Map([
  [".css", "text/css"],
  [".html", "text/html"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);

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

export async function withCaptureServer(run) {
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

export async function installStaticBuildRoute(page) {
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
