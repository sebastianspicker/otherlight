/** Builds the self-contained static GitHub Pages artifact without running the product. */

import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(repositoryRoot, "pages-dist");
const assetDirectory = path.join(outputDirectory, "assets");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(assetDirectory, { recursive: true });

await Promise.all([
  cp(path.join(repositoryRoot, "demo", "index.html"), path.join(outputDirectory, "index.html")),
  cp(path.join(repositoryRoot, "demo", "styles.css"), path.join(outputDirectory, "styles.css")),
  cp(path.join(repositoryRoot, "demo", "app.js"), path.join(outputDirectory, "app.js")),
  cp(
    path.join(repositoryRoot, "public", "brand", "otherlight-signal-eclipse.svg"),
    path.join(assetDirectory, "otherlight-signal-eclipse.svg"),
  ),
  cp(
    path.join(repositoryRoot, "docs", "screenshots", "web", "01-education-simulation.png"),
    path.join(assetDirectory, "01-education-simulation.png"),
  ),
  cp(
    path.join(repositoryRoot, "docs", "screenshots", "web", "02-guided-lab.png"),
    path.join(assetDirectory, "02-guided-lab.png"),
  ),
  cp(
    path.join(repositoryRoot, "docs", "screenshots", "web", "07-scientific-result.png"),
    path.join(assetDirectory, "07-scientific-result.png"),
  ),
  cp(
    path.join(repositoryRoot, "docs", "screenshots", "web", "manifest.json"),
    path.join(assetDirectory, "screenshot-manifest.json"),
  ),
]);

await writeFile(path.join(outputDirectory, ".nojekyll"), "", "utf8");
