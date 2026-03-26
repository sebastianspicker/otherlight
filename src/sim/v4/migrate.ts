import type { SystemParams } from "../../core/types";
import type { SimulationConfigV4 } from "./types";
import { defaultBinaryOrbit, sanitizeStaticOrbit } from "./orbitSanitizer";

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

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
    r: Math.max(0, (input.star?.r ?? 1) * 0.95),
    m: input.star?.m,
    shape: input.star?.shape,
    rings: input.star?.rings,
    spin: input.star?.spin,
    gravityHarmonics: input.star?.gravityHarmonics,
    tides: input.star?.tides,
    luminosityScale: 0,
  };

  const binary = sanitizeStaticOrbit(input.planet?.orbit, defaultBinaryOrbit());

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
          orbit: sanitizeStaticOrbit(input.moon.orbitAroundPlanet, defaultBinaryOrbit()),
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
    isObject(input) &&
    (input as Record<string, unknown>).version === "4" &&
    isObject((input as Record<string, unknown>).bodies),
  );
}

export function normalizeScenarioInputToV4(input: unknown): SimulationConfigV4 {
  if (isSimulationConfigV4(input)) return input;
  if (!isObject(input)) {
    throw new Error("normalizeScenarioInputToV4: input must be an object.");
  }

  const rec = input as Record<string, unknown>;
  if (isObject(rec.defaults)) {
    return migrateSystemParamsToV4(rec.defaults as SystemParams);
  }

  return migrateSystemParamsToV4(input as SystemParams);
}
