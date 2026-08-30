/**
 * Cross-checks physics claims against source owners, tests, and bibliography
 * entries so public model status cannot drift from executable evidence.
 */

import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const registryPath = resolve(root, "docs/physics/model-registry.json");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const bibliography = await readFile(resolve(root, "docs/references.bib"), "utf8");
const bibliographyIds = new Set(
  [...bibliography.matchAll(/@[A-Za-z]+\{([^,\s]+),/g)].map((match) => match[1]),
);

const allowedStatuses = new Set(registry.statusValues ?? []);
const requiredFields = [
  "id",
  "status",
  "claim",
  "equation",
  "units",
  "validity",
  "owners",
  "tests",
  "references",
];
const requiredOwners = [
  "apps/browser/src/domain/model/units.ts",
  "apps/browser/src/domain/orbits/kepler.ts",
  "apps/browser/src/domain/orbits/frames.ts",
  "apps/browser/src/domain/orbits/barycenter.ts",
  "apps/browser/src/domain/orbits/hillRadius.ts",
  "apps/browser/src/domain/orbits/exomoonTiming.ts",
  "apps/browser/src/domain/simulation/transitTimingSolve.ts",
  "apps/browser/src/domain/photometry/transitLimbDarkened.ts",
  "apps/browser/src/domain/photometry/transitTransmission.ts",
  "apps/browser/src/domain/photometry/limbDarkening.ts",
  "apps/browser/src/domain/photometry/atmosphereRT/model.ts",
  "apps/browser/src/domain/photometry/dayNightVisibility.ts",
  "apps/browser/src/domain/photometry/phaseCurve.ts",
  "apps/browser/src/domain/photometry/forwardScattering.ts",
  "apps/browser/src/domain/photometry/stellarBandFlux.ts",
  "apps/browser/src/domain/photometry/stellarVariability.ts",
  "apps/browser/src/domain/photometry/smearing.ts",
  "apps/browser/src/domain/photometry/instrumentNoise.ts",
  "apps/browser/src/domain/photometry/random.ts",
  "apps/browser/src/domain/simulation/v4/nativeSnapshot.ts",
  "apps/browser/src/domain/simulation/v4/nativePhotometry.ts",
  "apps/browser/src/domain/simulation/v4/nativeModel.ts",
  "apps/browser/src/domain/simulation/v4/nativeEngine.ts",
];

const errors = [];
const ids = new Set();
const owners = new Set();

async function sourceFiles(directory) {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...(await sourceFiles(relative)));
    else if (entry.isFile() && entry.name.endsWith(".ts")) paths.push(relative);
  }
  return paths;
}

if (registry.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if (!Array.isArray(registry.models) || registry.models.length === 0)
  errors.push("models must be a non-empty array");

for (const [index, model] of (registry.models ?? []).entries()) {
  for (const field of requiredFields) {
    if (!(field in model)) errors.push(`models[${index}] is missing ${field}`);
  }
  if (ids.has(model.id)) errors.push(`duplicate model id: ${model.id}`);
  ids.add(model.id);
  if (!allowedStatuses.has(model.status)) errors.push(`${model.id}: invalid status ${model.status}`);
  for (const field of ["owners", "tests", "references"]) {
    if (!Array.isArray(model[field]) || model[field].length === 0) {
      errors.push(`${model.id}: ${field} must be non-empty`);
    }
  }
  for (const owner of model.owners ?? []) owners.add(owner);
  for (const path of [...(model.owners ?? []), ...(model.tests ?? [])]) {
    try {
      await access(resolve(root, path));
    } catch {
      errors.push(`${model.id}: registered path does not exist: ${path}`);
    }
  }
  for (const reference of model.references ?? []) {
    if (!bibliographyIds.has(reference)) {
      errors.push(`${model.id}: bibliography entry does not exist: ${reference}`);
    }
  }
}

for (const requiredOwner of requiredOwners) {
  if (!owners.has(requiredOwner)) errors.push(`formula owner is not registered: ${requiredOwner}`);
}
for (const formulaOwner of await sourceFiles("apps/browser/src/domain/orbits")) {
  if (!owners.has(formulaOwner)) errors.push(`physics source is not registered: ${formulaOwner}`);
}
for (const formulaOwner of await sourceFiles("apps/browser/src/domain/photometry")) {
  if (!owners.has(formulaOwner)) errors.push(`photometry source is not registered: ${formulaOwner}`);
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`physics-registry: ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `physics-registry: ${registry.models.length} models, ${owners.size} owners validated\n`,
  );
}
