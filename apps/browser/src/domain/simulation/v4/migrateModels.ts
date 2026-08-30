/** Builds and sanitizes V4 simulation models from legacy system parameters. */
import { deepClone } from "../../model/clone";
import type { BinaryStarPhotometryParams, OrbitElements, BrowserScenarioDraft } from "../../model/types";
import { defaultBinaryOrbit, sanitizeStaticOrbit } from "./orbitSanitizer";
import type { HierarchyLinkV4, MoonBodyV4, PlanetBodyV4, EducationScenarioV4, StarBodyV4 } from "./types";

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

function sanitizeBinaryStarPhotometry(
  photometry: BinaryStarPhotometryParams | undefined,
  fallback: { luminosityScale: number; passband?: string },
): BinaryStarPhotometryParams {
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
}

function sanitizeStarBodyV4(
  star: StarBodyV4,
  fallback: { luminosityScale: number; passband?: string },
): StarBodyV4 {
  return { ...star, ...sanitizeBinaryStarPhotometry(star, fallback) };
}

export function sanitizeEducationScenarioV4(config: EducationScenarioV4): EducationScenarioV4 {
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
}

function fallbackPassbandFromInput(input: BrowserScenarioDraft): string | undefined {
  return input.star?.photometry?.limbDarkeningModel?.bandpass;
}

function primaryBinaryPhotometry(
  input: BrowserScenarioDraft,
  fallbackPassband: string | undefined,
): BinaryStarPhotometryParams {
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
}

function starsFromInput(
  input: BrowserScenarioDraft,
  fallbackPassband: string | undefined,
): [StarBodyV4, StarBodyV4] {
  const primaryPhotometry = primaryBinaryPhotometry(input, fallbackPassband);
  const secondaryPhotometry = sanitizeBinaryStarPhotometry(input.binaryStars?.secondary, {
    luminosityScale: 0,
    passband: fallbackPassband,
  });
  const primary: StarBodyV4 = {
    id: "star-a",
    r: input.star?.r ?? 1,
    m: input.star?.m,
    shape: input.star?.shape,
    rings: input.star?.rings,
    spin: input.star?.spin,
    gravityHarmonics: input.star?.gravityHarmonics,
    tides: input.star?.tides,
    ...primaryPhotometry,
  };
  const secondary: StarBodyV4 = {
    id: "star-b",
    r: Math.max(0, (input.star?.r ?? 1) * 0.95),
    m: 0,
    shape: input.star?.shape,
    rings: input.star?.rings,
    spin: input.star?.spin,
    gravityHarmonics: input.star?.gravityHarmonics,
    tides: input.star?.tides,
    ...secondaryPhotometry,
  };
  return [primary, secondary];
}

function moonsFromInput(input: BrowserScenarioDraft): MoonBodyV4[] {
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
}

function hierarchyFromMoons(moons: MoonBodyV4[]): HierarchyLinkV4[] {
  return [
    { childId: "planet-1", parentId: "star-a", relation: "orbits" },
    ...moons.map((moon) => ({
      childId: moon.id,
      parentId: moon.parentPlanetId,
      relation: "orbits" as const,
    })),
  ];
}

export function mapBrowserScenarioDraftToEducationScenarioV4(
  input: BrowserScenarioDraft,
): EducationScenarioV4 {
  const fallbackPassband = fallbackPassbandFromInput(input);
  const binary: OrbitElements = sanitizeStaticOrbit(input.planet?.orbit, defaultBinaryOrbit());
  const moons = moonsFromInput(input);
  const planet: PlanetBodyV4 = {
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
  return {
    version: "4",
    mode: "general-lab",
    runtime: { mode: "realtime", referenceSubsteps: 5, executionMode: "interactive" },
    observer: input.observer,
    binaryLab: {
      enabled: true,
      hideSkyUntilReveal: true,
      requireHypothesis: true,
      lockParamsUntilHypothesis: true,
    },
    bodies: { stars: starsFromInput(input, fallbackPassband), planets: [planet], moons },
    orbits: { binary, hierarchy: hierarchyFromMoons(moons) },
    photometry: input.star?.photometry,
    dynamics: input.dynamics,
    didactics: input.didactics,
  };
}
