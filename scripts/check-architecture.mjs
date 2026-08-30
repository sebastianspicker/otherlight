/** Enforces browser layer import boundaries and rejects relative TypeScript import cycles. */

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

function importedSpecifiers(source) {
  return [...source.matchAll(importPattern)].map((match) => match[1]);
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

function addBoundaryViolations(file, source, violations) {
  const sourceLayer = layerForPath(file);
  const forbidden = sourceLayer ? forbiddenImports.get(sourceLayer) : undefined;
  if (!forbidden) return;

  for (const specifier of importedSpecifiers(source)) {
    const target = resolveImport(file, specifier);
    const targetLayer = target ? layerForPath(target) : undefined;
    if (targetLayer && forbidden.has(targetLayer)) {
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

for (const layer of layers) {
  if (!existsSync(path.join(sourceRoot, layer))) {
    throw new Error(`Browser architecture layer is missing: ${displayPath(path.join(sourceRoot, layer))}`);
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
    process.stderr.write(`- forbidden layer import: ${violation}\n`);
  for (const cycle of [...new Set(cycleViolations)].sort())
    process.stderr.write(`- import cycle: ${cycle}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Architecture check passed (${files.length} browser TypeScript modules).\n`);
}
