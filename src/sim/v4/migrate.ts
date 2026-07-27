/**
 * Owns migrate support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import { deepClone } from "../../core/clone";
import type { BinaryStarPhotometryParams, OrbitElements, SystemParams } from "../../core/types";
import type { HierarchyLinkV4, MoonBodyV4, PlanetBodyV4, SimulationConfigV4, StarBodyV4 } from "./types";
import { defaultBinaryOrbit, isValidStaticOrbit, sanitizeStaticOrbit } from "./orbitSanitizer";

// V4 is the runtime contract. This module accepts either an explicit V4 config
// or the older SystemParams shell and normalizes it into the same shape before
// validation/simulation.
const isObject = (x: unknown): x is Record<string, unknown> => {
  return typeof x === "object" && x !== null;
};

const isFiniteNumber = (x: unknown): x is number => {
  return typeof x === "number" && Number.isFinite(x);
};

const isNonEmptyString = (x: unknown): x is string => {
  return typeof x === "string" && x.length > 0;
};

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

type IdentifiedRecord = Record<string, unknown> & { id: string };
type HierarchyRecord = Record<string, unknown> & { childId: string; parentId: string };
type AtmosphereRTConfig = NonNullable<NonNullable<SimulationConfigV4["photometry"]>["atmosphereRT"]>;

const STAR_FINITE_FIELDS = ["luminosityScale", "teffK", "loggCgs", "metallicityDex"] as const;

const arrayOrEmpty = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

const hasInvalidFinitePositive = (values: unknown[]): boolean => {
  return values.some((value) => !isFiniteNumber(value) || value <= 0);
};

const hasInvalidFiniteNonNegative = (values: unknown[]): boolean => {
  return values.some((value) => !isFiniteNumber(value) || value < 0);
};

const spectralBandpass = (photometry: unknown): Record<string, unknown> | undefined => {
  if (!isObject(photometry)) return undefined;
  const bandpass = photometry.spectralBandpass;
  return isObject(bandpass) && bandpass.enabled === true ? bandpass : undefined;
};

const collectSpectralLambdaIssues = (lambdaNm: unknown[]): string[] => {
  return lambdaNm.length > 0 && hasInvalidFinitePositive(lambdaNm)
    ? ["photometry.spectralBandpass.lambdaNm entries must be finite and > 0"]
    : [];
};

const collectSpectralWeightIssues = (lambdaNm: unknown[], weights: unknown[]): string[] => {
  const issues: string[] = [];
  if (weights.length > 0 && hasInvalidFiniteNonNegative(weights)) {
    issues.push("photometry.spectralBandpass.weights entries must be finite and >= 0");
  }
  if (weights.length > 0 && weights.length !== lambdaNm.length) {
    issues.push("photometry.spectralBandpass.weights must match lambdaNm length when provided");
  }
  return issues;
};

const collectSpectralBandpassIssues = (photometry: unknown): string[] => {
  const bandpass = spectralBandpass(photometry);
  if (!bandpass) return [];
  const lambdaNm = arrayOrEmpty(bandpass.lambdaNm);
  const weights = arrayOrEmpty(bandpass.weights);
  return [...collectSpectralLambdaIssues(lambdaNm), ...collectSpectralWeightIssues(lambdaNm, weights)];
};

const sanitizeBinaryStarPhotometry = (
  photometry: BinaryStarPhotometryParams | undefined,
  fallback: { luminosityScale: number; passband?: string },
): BinaryStarPhotometryParams => {
  const out: BinaryStarPhotometryParams = {
    luminosityScale: isFiniteNumber(photometry?.luminosityScale)
      ? Math.max(0, photometry.luminosityScale)
      : fallback.luminosityScale,
  };
  if (isFiniteNumber(photometry?.teffK)) out.teffK = photometry.teffK;
  if (isFiniteNumber(photometry?.loggCgs)) out.loggCgs = photometry.loggCgs;
  if (isFiniteNumber(photometry?.metallicityDex)) out.metallicityDex = photometry.metallicityDex;
  const passband = isNonEmptyString(photometry?.passband)
    ? photometry.passband
    : isNonEmptyString(fallback.passband)
      ? fallback.passband
      : undefined;
  if (passband) out.passband = passband;
  return out;
};

const sanitizeStarBodyV4 = (
  star: StarBodyV4,
  fallback: { luminosityScale: number; passband?: string },
): StarBodyV4 => {
  return {
    ...star,
    ...sanitizeBinaryStarPhotometry(star, fallback),
  };
};

const enabledAtmosphereRT = (config: SimulationConfigV4): AtmosphereRTConfig | undefined => {
  const rt = config.photometry?.atmosphereRT;
  return rt?.enabled ? rt : undefined;
};

const hasTemperatureProfile = (rt: AtmosphereRTConfig): boolean => {
  return Array.isArray(rt.temperatureProfileK) && rt.temperatureProfileK.length > 0;
};

const collectUnsupportedRTFeaturePaths = (rt: AtmosphereRTConfig): string[] => {
  const issues: string[] = [];
  if (hasTemperatureProfile(rt)) issues.push("photometry.atmosphereRT.temperatureProfileK");
  if (rt.scattering?.enabled) issues.push("photometry.atmosphereRT.scattering");
  if (rt.emission?.enabled) issues.push("photometry.atmosphereRT.emission");
  return issues;
};

const collectUnsupportedRTLayerPaths = (rt: AtmosphereRTConfig): string[] => {
  const issues: string[] = [];
  for (const [index, layer] of (rt.layers ?? []).entries()) {
    if (layer.temperatureK !== undefined) {
      issues.push(`photometry.atmosphereRT.layers[${index}].temperatureK`);
    }
  }

  return issues;
};

export function collectUnsupportedPhotometryFeaturesV4(config: SimulationConfigV4): string[] {
  const rt = enabledAtmosphereRT(config);
  if (!rt) return [];
  return [...collectUnsupportedRTFeaturePaths(rt), ...collectUnsupportedRTLayerPaths(rt)];
}

const validateTopLevelFields = (input: Record<string, unknown>, errors: string[]): void => {
  if (input.version !== "4") errors.push('version must equal "4"');
  if (input.mode !== "general-lab" && input.mode !== "detached-binary-lab") {
    errors.push('mode must be "general-lab" or "detached-binary-lab"');
  }
  errors.push(...collectSpectralBandpassIssues(input.photometry));
};

const validateRuntimeMode = (runtime: Record<string, unknown>, errors: string[]): void => {
  if (runtime.mode !== undefined && runtime.mode !== "realtime" && runtime.mode !== "reference") {
    errors.push('runtime.mode must be "realtime" or "reference"');
  }
};

const validateRuntimeExecutionMode = (runtime: Record<string, unknown>, errors: string[]): void => {
  const executionMode = runtime.executionMode;
  if (
    executionMode !== undefined &&
    executionMode !== "interactive" &&
    executionMode !== "scientific-browser"
  ) {
    errors.push('runtime.executionMode must be "interactive" or "scientific-browser"');
  }
};

const validateRuntimeReferenceSubsteps = (runtime: Record<string, unknown>, errors: string[]): void => {
  if (runtime.referenceSubsteps !== undefined && !isFiniteNumber(runtime.referenceSubsteps)) {
    errors.push("runtime.referenceSubsteps must be finite when provided");
  }
};

const validateRuntime = (input: Record<string, unknown>, errors: string[]): void => {
  if (input.runtime === undefined) return;
  if (!isObject(input.runtime)) {
    errors.push("runtime must be an object when provided");
    return;
  }
  const runtime = input.runtime;
  validateRuntimeMode(runtime, errors);
  validateRuntimeExecutionMode(runtime, errors);
  validateRuntimeReferenceSubsteps(runtime, errors);
};

const validationCollections = (
  input: Record<string, unknown>,
  errors: string[],
): ValidationCollections | undefined => {
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
};

const validateCollectionShapes = (collections: ValidationCollections, errors: string[]): void => {
  if (!Array.isArray(collections.stars) || collections.stars.length !== 2) {
    errors.push("bodies.stars must contain exactly two stars");
  }
  if (!Array.isArray(collections.planets)) errors.push("bodies.planets must be an array");
  if (!Array.isArray(collections.moons)) errors.push("bodies.moons must be an array");
  if (!isValidStaticOrbit(collections.binary)) errors.push("orbits.binary must be a valid complete orbit");
  if (!Array.isArray(collections.hierarchy)) errors.push("orbits.hierarchy must be an array");
};

const identifiedRecord = (value: unknown, error: string, errors: string[]): IdentifiedRecord | undefined => {
  if (!isObject(value) || !isNonEmptyString(value.id)) {
    errors.push(error);
    return;
  }
  return value as IdentifiedRecord;
};

const validateStarFiniteFields = (star: IdentifiedRecord, errors: string[]): void => {
  for (const field of STAR_FINITE_FIELDS) {
    if (star[field] !== undefined && !isFiniteNumber(star[field])) {
      errors.push(`star "${star.id}" has invalid ${field}`);
    }
  }
};

const validateStarPassband = (star: IdentifiedRecord, errors: string[]): void => {
  if (star.passband !== undefined && !isNonEmptyString(star.passband)) {
    errors.push(`star "${star.id}" has invalid passband`);
  }
};

const validateStar = (star: unknown, ids: ValidationIds, errors: string[]): void => {
  const record = identifiedRecord(star, "each star must define a non-empty id", errors);
  if (!record) return;

  ids.starIds.add(record.id);
  validateStarFiniteFields(record, errors);
  validateStarPassband(record, errors);
};

const validatePlanetParentSystem = (planet: IdentifiedRecord, errors: string[]): void => {
  if (
    planet.parentSystem !== undefined &&
    planet.parentSystem !== "star" &&
    planet.parentSystem !== "circumbinary"
  ) {
    errors.push(`planet "${planet.id}" has invalid parentSystem`);
  }
};

const hasUnknownPlanetParentStar = (planet: IdentifiedRecord, ids: ValidationIds): boolean => {
  return (
    planet.parentSystem !== "circumbinary" &&
    planet.parentStarId !== undefined &&
    (!isNonEmptyString(planet.parentStarId) || !ids.starIds.has(planet.parentStarId))
  );
};

const validatePlanetParent = (planet: IdentifiedRecord, ids: ValidationIds, errors: string[]): void => {
  validatePlanetParentSystem(planet, errors);
  if (hasUnknownPlanetParentStar(planet, ids)) {
    errors.push(`planet "${planet.id}" references unknown parent star "${String(planet.parentStarId)}"`);
  }
};

const validatePlanet = (planet: unknown, ids: ValidationIds, errors: string[]): void => {
  const record = identifiedRecord(planet, "each planet must define a non-empty id", errors);
  if (!record) return;

  ids.planetIds.add(record.id);
  if (!isValidStaticOrbit(record.orbit)) {
    errors.push(`planet "${record.id}" must define a valid complete orbit`);
  }
  validatePlanetParent(record, ids, errors);
};

const validateMoon = (moon: unknown, ids: ValidationIds, errors: string[]): void => {
  const record = identifiedRecord(moon, "each moon must define a non-empty id", errors);
  if (!record) return;

  ids.moonIds.add(record.id);
  if (!isValidStaticOrbit(record.orbit)) {
    errors.push(`moon "${record.id}" must define a valid complete orbit`);
  }
  if (!isNonEmptyString(record.parentPlanetId) || !ids.planetIds.has(record.parentPlanetId)) {
    errors.push(`moon "${record.id}" references unknown parent planet "${String(record.parentPlanetId)}"`);
  }
};

const hierarchyRecord = (value: unknown, errors: string[]): HierarchyRecord | undefined => {
  if (!isObject(value) || !isNonEmptyString(value.childId) || !isNonEmptyString(value.parentId)) {
    errors.push("each hierarchy link must define non-empty childId and parentId");
    return;
  }
  return value as HierarchyRecord;
};

const validateHierarchyRelation = (link: HierarchyRecord, errors: string[]): void => {
  if (link.relation !== "orbits") {
    errors.push(`hierarchy link "${link.childId}" must use relation "orbits"`);
  }
};

const validateHierarchyChild = (link: HierarchyRecord, ids: ValidationIds, errors: string[]): void => {
  if (!ids.planetIds.has(link.childId) && !ids.moonIds.has(link.childId)) {
    errors.push(`hierarchy child "${link.childId}" does not reference a known planet or moon`);
  }
};

const validateHierarchyParent = (link: HierarchyRecord, ids: ValidationIds, errors: string[]): void => {
  if (!ids.starIds.has(link.parentId) && !ids.planetIds.has(link.parentId)) {
    errors.push(`hierarchy parent "${link.parentId}" does not reference a known star or planet`);
  }
};

const validateHierarchyLink = (link: unknown, ids: ValidationIds, errors: string[]): void => {
  const record = hierarchyRecord(link, errors);
  if (!record) return;

  validateHierarchyRelation(record, errors);
  validateHierarchyChild(record, ids, errors);
  validateHierarchyParent(record, ids, errors);
};

const validateStars = (stars: unknown, ids: ValidationIds, errors: string[]): void => {
  if (Array.isArray(stars)) {
    for (const star of stars) validateStar(star, ids, errors);
  }
};

const validatePlanets = (planets: unknown, ids: ValidationIds, errors: string[]): void => {
  if (Array.isArray(planets)) {
    for (const planet of planets) validatePlanet(planet, ids, errors);
  }
};

const validateMoons = (moons: unknown, ids: ValidationIds, errors: string[]): void => {
  if (Array.isArray(moons)) {
    for (const moon of moons) validateMoon(moon, ids, errors);
  }
};

const validateHierarchy = (hierarchy: unknown, ids: ValidationIds, errors: string[]): void => {
  if (Array.isArray(hierarchy)) {
    for (const link of hierarchy) validateHierarchyLink(link, ids, errors);
  }
};

const emptyValidationIds = (): ValidationIds => {
  return { starIds: new Set(), planetIds: new Set(), moonIds: new Set() };
};

const validateBodiesAndHierarchy = (collections: ValidationCollections, errors: string[]): void => {
  const ids = emptyValidationIds();
  validateStars(collections.stars, ids, errors);
  validatePlanets(collections.planets, ids, errors);
  validateMoons(collections.moons, ids, errors);
  validateHierarchy(collections.hierarchy, ids, errors);
};

const sanitizeSimulationConfigV4 = (config: SimulationConfigV4): SimulationConfigV4 => {
  const clone = deepClone(config);
  clone.runtime = {
    mode: clone.runtime?.mode === "reference" ? "reference" : "realtime",
    referenceSubsteps: isFiniteNumber(clone.runtime?.referenceSubsteps)
      ? clone.runtime?.referenceSubsteps
      : 5,
    executionMode:
      clone.runtime?.executionMode === "scientific-browser" ? "scientific-browser" : "interactive",
  };
  const fallbackPassband =
    clone.runtime.executionMode === "scientific-browser"
      ? undefined
      : clone.photometry?.limbDarkeningModel?.bandpass;
  clone.bodies.stars = [
    sanitizeStarBodyV4(clone.bodies.stars[0], { luminosityScale: 1, passband: fallbackPassband }),
    sanitizeStarBodyV4(clone.bodies.stars[1], {
      luminosityScale: clone.mode === "detached-binary-lab" ? 0.3 : 0,
      passband: fallbackPassband,
    }),
  ];
  return clone;
};

const validateSimulationConfigV4 = (input: unknown): string[] => {
  if (!isObject(input)) return ["config must be an object"];

  const errors: string[] = [];
  validateTopLevelFields(input, errors);
  validateRuntime(input, errors);
  const collections = validationCollections(input, errors);
  if (!collections) return errors;

  validateCollectionShapes(collections, errors);
  validateBodiesAndHierarchy(collections, errors);

  return errors;
};

const fallbackPassbandFromInput = (input: SystemParams): string | undefined => {
  return input.star?.photometry?.limbDarkeningModel?.bandpass;
};

const primaryBinaryPhotometry = (
  input: SystemParams,
  fallbackPassband: string | undefined,
): BinaryStarPhotometryParams => {
  return sanitizeBinaryStarPhotometry(
    {
      teffK: input.star?.photometry?.limbDarkeningModel?.stellar?.teffK,
      loggCgs: input.star?.photometry?.limbDarkeningModel?.stellar?.loggCgs,
      metallicityDex: input.star?.photometry?.limbDarkeningModel?.stellar?.metallicityDex,
      passband: fallbackPassband,
      ...input.binaryStars?.primary,
    },
    { luminosityScale: 1, passband: fallbackPassband },
  );
};

const secondaryBinaryPhotometry = (
  input: SystemParams,
  fallbackPassband: string | undefined,
): BinaryStarPhotometryParams => {
  return sanitizeBinaryStarPhotometry(input.binaryStars?.secondary, {
    luminosityScale: 0,
    passband: fallbackPassband,
  });
};

const primaryStarFromInput = (input: SystemParams, photometry: BinaryStarPhotometryParams): StarBodyV4 => {
  return {
    id: "star-a",
    r: input.star?.r ?? 1,
    m: input.star?.m,
    shape: input.star?.shape,
    rings: input.star?.rings,
    spin: input.star?.spin,
    gravityHarmonics: input.star?.gravityHarmonics,
    tides: input.star?.tides,
    ...photometry,
  };
};

const secondaryStarFromInput = (input: SystemParams, photometry: BinaryStarPhotometryParams): StarBodyV4 => {
  // Inert placeholder for the secondary star in legacy→V4 migration.
  // luminosityScale and mass are zero so general-lab migration keeps a single-star barycenter.
  return {
    id: "star-b",
    r: Math.max(0, (input.star?.r ?? 1) * 0.95),
    m: 0,
    shape: input.star?.shape,
    rings: input.star?.rings,
    spin: input.star?.spin,
    gravityHarmonics: input.star?.gravityHarmonics,
    tides: input.star?.tides,
    ...photometry,
  };
};

const starsFromInput = (
  input: SystemParams,
  fallbackPassband: string | undefined,
): [StarBodyV4, StarBodyV4] => {
  return [
    primaryStarFromInput(input, primaryBinaryPhotometry(input, fallbackPassband)),
    secondaryStarFromInput(input, secondaryBinaryPhotometry(input, fallbackPassband)),
  ];
};

const binaryOrbitFromInput = (input: SystemParams): OrbitElements => {
  return sanitizeStaticOrbit(input.planet?.orbit, defaultBinaryOrbit());
};

const planetFromInput = (input: SystemParams, binary: OrbitElements): PlanetBodyV4 => {
  return {
    id: "planet-1",
    r: input.planet?.r ?? 1,
    m: input.planet?.m,
    shape: input.planet?.shape,
    rings: input.planet?.rings,
    spin: input.planet?.spin,
    gravityHarmonics: input.planet?.gravityHarmonics,
    tides: input.planet?.tides,
    orbit: binary,
    parentStarId: "star-a",
    parentSystem: "star",
  };
};

const moonsFromInput = (input: SystemParams): MoonBodyV4[] => {
  if (!input.moon) return [];
  return [
    {
      id: "moon-1",
      r: input.moon.r,
      m: input.moon.m,
      shape: input.moon.shape,
      rings: input.moon.rings,
      spin: input.moon.spin,
      gravityHarmonics: input.moon.gravityHarmonics,
      tides: input.moon.tides,
      orbit: sanitizeStaticOrbit(input.moon.orbitAroundPlanet, defaultBinaryOrbit()),
      parentPlanetId: "planet-1",
    },
  ];
};

const hierarchyFromMoons = (moons: MoonBodyV4[]): HierarchyLinkV4[] => {
  return [
    { childId: "planet-1", parentId: "star-a", relation: "orbits" },
    ...moons.map((moon) => ({
      childId: moon.id,
      parentId: moon.parentPlanetId,
      relation: "orbits" as const,
    })),
  ];
};

const defaultRuntimeV4 = (): SimulationConfigV4["runtime"] => {
  return { mode: "realtime", referenceSubsteps: 5, executionMode: "interactive" };
};

const defaultBinaryLabV4 = (): SimulationConfigV4["binaryLab"] => {
  return {
    enabled: true,
    hideSkyUntilReveal: true,
    requireHypothesis: true,
    lockParamsUntilHypothesis: true,
  };
};

const migratedBodiesFromInput = (
  input: SystemParams,
  binary: OrbitElements,
  fallbackPassband: string | undefined,
): SimulationConfigV4["bodies"] => {
  const moons = moonsFromInput(input);
  return {
    stars: starsFromInput(input, fallbackPassband),
    planets: [planetFromInput(input, binary)],
    moons,
  };
};

const migratedOrbitsFromBodies = (
  binary: OrbitElements,
  moons: MoonBodyV4[],
): SimulationConfigV4["orbits"] => {
  return {
    binary,
    hierarchy: hierarchyFromMoons(moons),
  };
};

export function migrateSystemParamsToV4(input: SystemParams): SimulationConfigV4 {
  const fallbackPassband = fallbackPassbandFromInput(input);
  const binary = binaryOrbitFromInput(input);
  const bodies = migratedBodiesFromInput(input, binary, fallbackPassband);

  return {
    version: "4",
    mode: "general-lab",
    runtime: defaultRuntimeV4(),
    observer: input.observer,
    binaryLab: defaultBinaryLabV4(),
    bodies,
    orbits: migratedOrbitsFromBodies(binary, bodies.moons),
    photometry: input.star?.photometry,
    dynamics: input.dynamics,
    didactics: input.didactics,
  };
}

export function isSimulationConfigV4(input: unknown): input is SimulationConfigV4 {
  return validateSimulationConfigV4(input).length === 0;
}

export function normalizeScenarioInputToV4(input: unknown): SimulationConfigV4 {
  if (!isObject(input)) {
    throw new Error("normalizeScenarioInputToV4: input must be an object.");
  }

  if (input.version === "4") {
    const errors = validateSimulationConfigV4(input);
    if (errors.length > 0) {
      throw new Error(`normalizeScenarioInputToV4: invalid V4 config: ${errors.join("; ")}`);
    }
    return sanitizeSimulationConfigV4(input as SimulationConfigV4);
  }

  const rec = input as Record<string, unknown>;
  if (isObject(rec.defaults)) {
    return sanitizeSimulationConfigV4(migrateSystemParamsToV4(rec.defaults as SystemParams));
  }

  return sanitizeSimulationConfigV4(migrateSystemParamsToV4(input as SystemParams));
}
