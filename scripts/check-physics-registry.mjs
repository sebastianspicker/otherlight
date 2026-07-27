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
  "src/core/units.ts",
  "src/physics/kepler.ts",
  "src/physics/frames.ts",
  "src/physics/barycenter.ts",
  "src/physics/hillRadius.ts",
  "src/physics/exomoonTiming.ts",
  "src/physics/relativityPrecessionFormula.ts",
  "src/physics/relativityTiming.ts",
  "src/physics/relativityShapiro.ts",
  "src/sim/nbody/integrator.ts",
  "src/sim/nbody/diagnosticsEnergy.ts",
  "src/sim/transitTimingSolve.ts",
  "src/photometry/transitUniform.ts",
  "src/photometry/transitLimbDarkened.ts",
  "src/photometry/transitTransmission.ts",
  "src/photometry/transitShapes.ts",
  "src/photometry/limbDarkening.ts",
  "src/photometry/atmosphereRT/model.ts",
  "src/photometry/dayNightVisibility.ts",
  "src/photometry/phaseCurve.ts",
  "src/photometry/forwardScattering.ts",
  "src/photometry/stellarBandFlux.ts",
  "src/photometry/stellarVariability.ts",
  "src/photometry/smearing.ts",
  "src/photometry/instrumentNoise.ts",
  "src/photometry/random.ts",
  "src/sim/v4/nativeSnapshot.ts",
  "src/sim/v4/nativePhotometry.ts",
  "src/sim/v4/nativeModel.ts",
  "src/sim/v4/nativeEngine.ts",
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
for (const formulaOwner of await sourceFiles("src/physics")) {
  if (!owners.has(formulaOwner)) errors.push(`physics source is not registered: ${formulaOwner}`);
}
for (const formulaOwner of await sourceFiles("src/photometry")) {
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
