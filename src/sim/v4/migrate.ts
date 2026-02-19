import type { OrbitElements, SystemParams } from "../../core/types";
import type { SimulationConfigV4 } from "./types";

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function asStaticOrbit(orbit: unknown, fallback: OrbitElements): OrbitElements {
  if (typeof orbit === "function" || !isObject(orbit)) return fallback;

  return {
    a: Number.isFinite((orbit as OrbitElements).a) ? (orbit as OrbitElements).a : fallback.a,
    e: Number.isFinite((orbit as OrbitElements).e) ? (orbit as OrbitElements).e : fallback.e,
    inc: Number.isFinite((orbit as OrbitElements).inc) ? (orbit as OrbitElements).inc : fallback.inc,
    Omega: Number.isFinite((orbit as OrbitElements).Omega) ? (orbit as OrbitElements).Omega : fallback.Omega,
    omega: Number.isFinite((orbit as OrbitElements).omega) ? (orbit as OrbitElements).omega : fallback.omega,
    period: Number.isFinite((orbit as OrbitElements).period)
      ? (orbit as OrbitElements).period
      : fallback.period,
    t0: Number.isFinite((orbit as OrbitElements).t0) ? (orbit as OrbitElements).t0 : fallback.t0,
  };
}

const DEFAULT_BINARY_ORBIT: OrbitElements = {
  a: 1,
  e: 0,
  inc: Math.PI / 2,
  Omega: 0,
  omega: 0,
  period: 1,
  t0: 0,
};

export function migrateSystemParamsToV4(input: SystemParams): SimulationConfigV4 {
  const primary = {
    id: "star-a",
    r: input.star?.r ?? 1,
    m: input.star?.m,
    shape: input.star?.shape,
    rings: input.star?.rings,
    spin: input.star?.spin,
    gravityHarmonics: input.star?.gravityHarmonics,
    tides: input.star?.tides,
    luminosityScale: 1,
  };

  const secondary = {
    id: "star-b",
    r: Math.max(1, (input.star?.r ?? 1) * 0.95),
    m: input.star?.m,
    shape: input.star?.shape,
    rings: input.star?.rings,
    spin: input.star?.spin,
    gravityHarmonics: input.star?.gravityHarmonics,
    tides: input.star?.tides,
    luminosityScale: 0,
  };

  const binary = asStaticOrbit(input.planet?.orbit, DEFAULT_BINARY_ORBIT);

  const planets = [
    {
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
      parentSystem: "star" as const,
    },
  ];

  const moons = input.moon
    ? [
        {
          id: "moon-1",
          r: input.moon.r,
          m: input.moon.m,
          shape: input.moon.shape,
          rings: input.moon.rings,
          spin: input.moon.spin,
          gravityHarmonics: input.moon.gravityHarmonics,
          tides: input.moon.tides,
          orbit: asStaticOrbit(input.moon.orbitAroundPlanet, DEFAULT_BINARY_ORBIT),
          parentPlanetId: "planet-1",
        },
      ]
    : [];

  const hierarchy: SimulationConfigV4["orbits"]["hierarchy"] = [
    { childId: "planet-1", parentId: "star-a", relation: "orbits" },
    ...moons.map((m) => ({ childId: m.id, parentId: m.parentPlanetId, relation: "orbits" as const })),
  ];

  return {
    version: "4",
    mode: "general-lab",
    runtime: { mode: "realtime", referenceSubsteps: 5 },
    observer: input.observer,
    binaryLab: {
      enabled: true,
      hideSkyUntilReveal: true,
      requireHypothesis: true,
      lockParamsUntilHypothesis: true,
    },
    bodies: {
      stars: [primary, secondary],
      planets,
      moons,
    },
    orbits: {
      binary,
      hierarchy,
    },
    photometry: input.star?.photometry,
    dynamics: input.dynamics,
    didactics: input.didactics,
  };
}

export function isSimulationConfigV4(input: unknown): input is SimulationConfigV4 {
  return Boolean(
    isObject(input) && (input as Record<string, unknown>).version === "4" && isObject((input as any).bodies),
  );
}

export function normalizeScenarioInputToV4(input: unknown): SimulationConfigV4 {
  if (isSimulationConfigV4(input)) return input;
  if (!isObject(input)) {
    throw new Error("normalizeScenarioInputToV4: input must be an object.");
  }

  if (isObject((input as any).defaults)) {
    return migrateSystemParamsToV4((input as any).defaults as SystemParams);
  }

  return migrateSystemParamsToV4(input as SystemParams);
}
