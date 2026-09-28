/**
 * Enforces browser layer import boundaries, keeps canvas rendering independent of
 * the rest of presentation, and rejects relative TypeScript import cycles.
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repositoryRoot, "apps/browser/src");
const layers = ["domain", "application", "infrastructure", "presentation", "composition"];
const forbiddenImports = new Map([
  ["domain", new Set(["application", "infrastructure", "presentation", "composition"])],
  ["infrastructure", new Set(["presentation", "composition"])],
  ["application", new Set(["presentation", "infrastructure", "composition"])],
]);
// Canvas drawing is a pure projection of domain output: it may not reach into
// presentation features, application state, infrastructure, or composition.
const restrictedAreas = [{ area: "presentation/render", allowed: ["domain", "presentation/render"] }];
const sourceExtensions = [".ts", ".tsx", ".mts", ".cts"];
const importPattern = /(?:\b(?:import|export)\s+(?:[^;"']*?\s+from\s+)?|\bimport\s*\()\s*["']([^"']+)["']/g;

function displayPath(file) {
  return path.relative(repositoryRoot, file).split(path.sep).join("/");
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(entryPath)));
    else if (
      entry.isFile() &&
      sourceExtensions.includes(path.extname(entry.name)) &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function layerForPath(file) {
  const [firstSegment] = path.relative(sourceRoot, file).split(path.sep);
  return layers.includes(firstSegment) ? firstSegment : undefined;
}

function sourcePath(file) {
  return path.relative(sourceRoot, file).split(path.sep).join("/");
}

function isWithin(file, area) {
  const relative = sourcePath(file);
  return relative === area || relative.startsWith(`${area}/`);
}

function importedSpecifiers(source) {
  const imports = [...source.matchAll(importPattern)].map((match) => match[1]);
  const workers = [...source.matchAll(/new URL\(["']([^"']+\.worker\.ts)["'],\s*import\.meta\.url\)/g)].map(
    (match) => match[1],
  );
  return [...imports, ...workers];
}

function resolveImport(fromFile, specifier) {
  let candidate;
  if (specifier.startsWith(".")) candidate = path.resolve(path.dirname(fromFile), specifier);
  else if (specifier.startsWith("@/")) candidate = path.join(sourceRoot, specifier.slice(2));
  else if (specifier.startsWith("src/")) candidate = path.join(sourceRoot, specifier.slice(4));
  else return undefined;

  const options = [candidate, ...sourceExtensions.map((extension) => `${candidate}${extension}`)];
  options.push(...sourceExtensions.map((extension) => path.join(candidate, `index${extension}`)));
  return options.find((option) => existsSync(option));
}

function isForbiddenImport(file, target) {
  const forbidden = forbiddenImports.get(layerForPath(file));
  const targetLayer = layerForPath(target);
  if (forbidden && targetLayer && forbidden.has(targetLayer)) return true;
  const restriction = restrictedAreas.find(({ area }) => isWithin(file, area));
  return Boolean(restriction && !restriction.allowed.some((allowed) => isWithin(target, allowed)));
}

function addBoundaryViolations(file, source, violations) {
  for (const specifier of importedSpecifiers(source)) {
    const target = resolveImport(file, specifier);
    if (target && isForbiddenImport(file, target)) {
      violations.push(`${displayPath(file)} imports ${displayPath(target)} (${specifier})`);
    }
  }
}

function addCycleViolations(graph, violations) {
  const state = new Map();
  const stack = [];

  function visit(file) {
    state.set(file, "visiting");
    stack.push(file);
    for (const target of graph.get(file) ?? []) {
      if (state.get(target) === "visiting") {
        const cycle = [...stack.slice(stack.indexOf(target)), target].map(displayPath).join(" -> ");
        violations.push(cycle);
      } else if (!state.has(target)) {
        visit(target);
      }
    }
    stack.pop();
    state.set(file, "done");
  }

  for (const file of [...graph.keys()].sort()) {
    if (!state.has(file)) visit(file);
  }
}

if (!existsSync(sourceRoot)) {
  throw new Error(`Browser source root is missing: ${displayPath(sourceRoot)}`);
}

for (const directory of [...layers, ...restrictedAreas.map(({ area }) => area)]) {
  if (!existsSync(path.join(sourceRoot, directory))) {
    throw new Error(
      `Browser architecture directory is missing: ${displayPath(path.join(sourceRoot, directory))}`,
    );
  }
}

const files = await sourceFiles(sourceRoot);
const boundaryViolations = [];
const graph = new Map();
for (const file of files) {
  const source = await readFile(file, "utf8");
  addBoundaryViolations(file, source, boundaryViolations);
  graph.set(
    file,
    [
      ...new Set(
        importedSpecifiers(source)
          .map((specifier) => resolveImport(file, specifier))
          .filter(Boolean),
      ),
    ].sort(),
  );
}
const cycleViolations = [];
addCycleViolations(graph, cycleViolations);

if (boundaryViolations.length || cycleViolations.length) {
  process.stderr.write("Architecture check failed:\n");
  for (const violation of boundaryViolations.sort())
    process.stderr.write(`- forbidden import: ${violation}\n`);
  for (const cycle of [...new Set(cycleViolations)].sort())
    process.stderr.write(`- import cycle: ${cycle}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Architecture check passed (${files.length} browser TypeScript modules).\n`);
}
