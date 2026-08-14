/** Performs ordered structural validation of V4 runtime configuration. */
import { isValidStaticOrbit } from "./orbitSanitizer";

type UnknownRecord = Record<string, unknown>;
type ValidationCollections = {
  stars: unknown;
  planets: unknown;
  moons: unknown;
  binary: unknown;
  hierarchy: unknown;
};
type ValidationIds = {
  starIds: Set<string>;
  planetIds: Set<string>;
  moonIds: Set<string>;
};
type IdentifiedRecord = UnknownRecord & { id: string };
type HierarchyRecord = UnknownRecord & { childId: string; parentId: string };

const STAR_FINITE_FIELDS = ["luminosityScale", "teffK", "loggCgs", "metallicityDex"] as const;
const isObject = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const arrayOrEmpty = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function collectSpectralBandpassIssues(photometry: unknown): string[] {
  if (!isObject(photometry)) return [];
  const bandpass = photometry.spectralBandpass;
  if (!isObject(bandpass) || bandpass.enabled !== true) return [];
  const lambdaNm = arrayOrEmpty(bandpass.lambdaNm);
  const weights = arrayOrEmpty(bandpass.weights);
  const issues: string[] = [];
  if (lambdaNm.length > 0 && lambdaNm.some((value) => !isFiniteNumber(value) || value <= 0)) {
    issues.push("photometry.spectralBandpass.lambdaNm entries must be finite and > 0");
  }
  if (weights.length > 0 && weights.some((value) => !isFiniteNumber(value) || value < 0)) {
    issues.push("photometry.spectralBandpass.weights entries must be finite and >= 0");
  }
  if (weights.length > 0 && weights.length !== lambdaNm.length) {
    issues.push("photometry.spectralBandpass.weights must match lambdaNm length when provided");
  }
  return issues;
}

export function validateTopLevelFields(input: UnknownRecord, errors: string[]): void {
  if (input.version !== "4") errors.push('version must equal "4"');
  if (input.mode !== "general-lab" && input.mode !== "detached-binary-lab") {
    errors.push('mode must be "general-lab" or "detached-binary-lab"');
  }
  errors.push(...collectSpectralBandpassIssues(input.photometry));
}

export function validateRuntime(input: UnknownRecord, errors: string[]): void {
  if (input.runtime === undefined) return;
  if (!isObject(input.runtime)) {
    errors.push("runtime must be an object when provided");
    return;
  }
  const runtime = input.runtime;
  if (runtime.mode !== undefined && runtime.mode !== "realtime" && runtime.mode !== "reference") {
    errors.push('runtime.mode must be "realtime" or "reference"');
  }
  if (
    runtime.executionMode !== undefined &&
    runtime.executionMode !== "interactive" &&
    runtime.executionMode !== "scientific-browser"
  ) {
    errors.push('runtime.executionMode must be "interactive" or "scientific-browser"');
  }
  if (runtime.referenceSubsteps !== undefined && !isFiniteNumber(runtime.referenceSubsteps)) {
    errors.push("runtime.referenceSubsteps must be finite when provided");
  }
}

export function validationCollections(
  input: UnknownRecord,
  errors: string[],
): ValidationCollections | undefined {
  if (!isObject(input.bodies)) {
    errors.push("bodies must be an object");
    return undefined;
  }
  if (!isObject(input.orbits)) {
    errors.push("orbits must be an object");
    return undefined;
  }
  return {
    stars: input.bodies.stars,
    planets: input.bodies.planets,
    moons: input.bodies.moons,
    binary: input.orbits.binary,
    hierarchy: input.orbits.hierarchy,
  };
}

export function validateCollectionShapes(collections: ValidationCollections, errors: string[]): void {
  if (!Array.isArray(collections.stars) || collections.stars.length !== 2) {
    errors.push("bodies.stars must contain exactly two stars");
  }
  if (!Array.isArray(collections.planets)) errors.push("bodies.planets must be an array");
  if (!Array.isArray(collections.moons)) errors.push("bodies.moons must be an array");
  if (!isValidStaticOrbit(collections.binary)) errors.push("orbits.binary must be a valid complete orbit");
  if (!Array.isArray(collections.hierarchy)) errors.push("orbits.hierarchy must be an array");
}

export function identifiedRecord(
  value: unknown,
  error: string,
  errors: string[],
): IdentifiedRecord | undefined {
  if (!isObject(value) || !isNonEmptyString(value.id)) {
    errors.push(error);
    return undefined;
  }
  return value as IdentifiedRecord;
}

export function validateStar(star: unknown, ids: ValidationIds, errors: string[]): void {
  const record = identifiedRecord(star, "each star must define a non-empty id", errors);
  if (!record) return;
  ids.starIds.add(record.id);
  for (const field of STAR_FINITE_FIELDS) {
    if (record[field] !== undefined && !isFiniteNumber(record[field])) {
      errors.push(`star "${record.id}" has invalid ${field}`);
    }
  }
  if (record.passband !== undefined && !isNonEmptyString(record.passband)) {
    errors.push(`star "${record.id}" has invalid passband`);
  }
}

export function validatePlanet(planet: unknown, ids: ValidationIds, errors: string[]): void {
  const record = identifiedRecord(planet, "each planet must define a non-empty id", errors);
  if (!record) return;
  ids.planetIds.add(record.id);
  if (!isValidStaticOrbit(record.orbit)) {
    errors.push(`planet "${record.id}" must define a valid complete orbit`);
  }
  if (
    record.parentSystem !== undefined &&
    record.parentSystem !== "star" &&
    record.parentSystem !== "circumbinary"
  ) {
    errors.push(`planet "${record.id}" has invalid parentSystem`);
  }
  if (
    record.parentSystem !== "circumbinary" &&
    record.parentStarId !== undefined &&
    (!isNonEmptyString(record.parentStarId) || !ids.starIds.has(record.parentStarId))
  ) {
    errors.push(`planet "${record.id}" references unknown parent star "${String(record.parentStarId)}"`);
  }
}

export function validateMoon(moon: unknown, ids: ValidationIds, errors: string[]): void {
  const record = identifiedRecord(moon, "each moon must define a non-empty id", errors);
  if (!record) return;
  ids.moonIds.add(record.id);
  if (!isValidStaticOrbit(record.orbit)) {
    errors.push(`moon "${record.id}" must define a valid complete orbit`);
  }
  if (!isNonEmptyString(record.parentPlanetId) || !ids.planetIds.has(record.parentPlanetId)) {
    errors.push(`moon "${record.id}" references unknown parent planet "${String(record.parentPlanetId)}"`);
  }
}

export function validateHierarchyLink(link: unknown, ids: ValidationIds, errors: string[]): void {
  if (!isObject(link) || !isNonEmptyString(link.childId) || !isNonEmptyString(link.parentId)) {
    errors.push("each hierarchy link must define non-empty childId and parentId");
    return;
  }
  const record = link as HierarchyRecord;
  if (record.relation !== "orbits") {
    errors.push(`hierarchy link "${record.childId}" must use relation "orbits"`);
  }
  if (!ids.planetIds.has(record.childId) && !ids.moonIds.has(record.childId)) {
    errors.push(`hierarchy child "${record.childId}" does not reference a known planet or moon`);
  }
  if (!ids.starIds.has(record.parentId) && !ids.planetIds.has(record.parentId)) {
    errors.push(`hierarchy parent "${record.parentId}" does not reference a known star or planet`);
  }
}

export function validateBodiesAndHierarchy(collections: ValidationCollections, errors: string[]): void {
  const ids: ValidationIds = { starIds: new Set(), planetIds: new Set(), moonIds: new Set() };
  if (Array.isArray(collections.stars)) {
    for (const star of collections.stars) validateStar(star, ids, errors);
  }
  if (Array.isArray(collections.planets)) {
    for (const planet of collections.planets) validatePlanet(planet, ids, errors);
  }
  if (Array.isArray(collections.moons)) {
    for (const moon of collections.moons) validateMoon(moon, ids, errors);
  }
  if (Array.isArray(collections.hierarchy)) {
    for (const link of collections.hierarchy) validateHierarchyLink(link, ids, errors);
  }
}

export function validateSimulationConfigV4(input: unknown): string[] {
  if (!isObject(input)) return ["config must be an object"];
  const errors: string[] = [];
  validateTopLevelFields(input, errors);
  validateRuntime(input, errors);
  const collections = validationCollections(input, errors);
  if (!collections) return errors;
  validateCollectionShapes(collections, errors);
  validateBodiesAndHierarchy(collections, errors);
  return errors;
}
