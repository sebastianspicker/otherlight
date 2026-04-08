import { deepClone } from "../../core/clone";
import type { SystemParams } from "../../core/types";
import type { SimulationConfigV4 } from "./types";
import { defaultBinaryOrbit, sanitizeStaticOrbit } from "./orbitSanitizer";

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}

function isOrbitElements(x: unknown): boolean {
  if (!isObject(x)) return false;
  return (
    isFiniteNumber(x.a) &&
    isFiniteNumber(x.e) &&
    isFiniteNumber(x.inc) &&
    isFiniteNumber(x.Omega) &&
    isFiniteNumber(x.omega) &&
    isFiniteNumber(x.period) &&
    isFiniteNumber(x.t0)
  );
}

export function collectUnsupportedPhotometryFeaturesV4(config: SimulationConfigV4): string[] {
  const disabled: string[] = [];
  if (config.photometry?.forwardScattering) disabled.push("forward scattering");
  if (config.photometry?.ringScattering) disabled.push("ring scattering");
  return disabled;
}

function sanitizeSimulationConfigV4(config: SimulationConfigV4): SimulationConfigV4 {
  const next = deepClone(config);
  if (next.photometry?.forwardScattering) delete next.photometry.forwardScattering;
  if (next.photometry?.ringScattering) delete next.photometry.ringScattering;
  return next;
}

function validateSimulationConfigV4(input: unknown): string[] {
  if (!isObject(input)) return ["config must be an object"];

  const errors: string[] = [];
  if (input.version !== "4") errors.push('version must equal "4"');
  if (input.mode !== "general-lab" && input.mode !== "detached-binary-lab") {
    errors.push('mode must be "general-lab" or "detached-binary-lab"');
  }

  if (!isObject(input.bodies)) {
    errors.push("bodies must be an object");
    return errors;
  }
  if (!isObject(input.orbits)) {
    errors.push("orbits must be an object");
    return errors;
  }

  const stars = input.bodies.stars;
  const planets = input.bodies.planets;
  const moons = input.bodies.moons;
  const binary = input.orbits.binary;
  const hierarchy = input.orbits.hierarchy;

  if (!Array.isArray(stars) || stars.length !== 2) {
    errors.push("bodies.stars must contain exactly two stars");
  }
  if (!Array.isArray(planets)) errors.push("bodies.planets must be an array");
  if (!Array.isArray(moons)) errors.push("bodies.moons must be an array");
  if (!isOrbitElements(binary)) errors.push("orbits.binary must be a complete orbit");
  if (!Array.isArray(hierarchy)) errors.push("orbits.hierarchy must be an array");

  const starIds = new Set<string>();
  const planetIds = new Set<string>();
  const moonIds = new Set<string>();

  if (Array.isArray(stars)) {
    for (const star of stars) {
      if (!isObject(star) || !isNonEmptyString(star.id)) {
        errors.push("each star must define a non-empty id");
        continue;
      }
      starIds.add(star.id);
    }
  }

  if (Array.isArray(planets)) {
    for (const planet of planets) {
      if (!isObject(planet) || !isNonEmptyString(planet.id)) {
        errors.push("each planet must define a non-empty id");
        continue;
      }
      planetIds.add(planet.id);
      if (!isOrbitElements(planet.orbit)) errors.push(`planet "${planet.id}" must define a complete orbit`);
      const parentSystem = planet.parentSystem;
      if (parentSystem !== undefined && parentSystem !== "star" && parentSystem !== "circumbinary") {
        errors.push(`planet "${planet.id}" has invalid parentSystem`);
      }
      if (
        parentSystem !== "circumbinary" &&
        planet.parentStarId !== undefined &&
        (!isNonEmptyString(planet.parentStarId) || !starIds.has(planet.parentStarId))
      ) {
        errors.push(`planet "${planet.id}" references unknown parent star "${String(planet.parentStarId)}"`);
      }
    }
  }

  if (Array.isArray(moons)) {
    for (const moon of moons) {
      if (!isObject(moon) || !isNonEmptyString(moon.id)) {
        errors.push("each moon must define a non-empty id");
        continue;
      }
      moonIds.add(moon.id);
      if (!isOrbitElements(moon.orbit)) errors.push(`moon "${moon.id}" must define a complete orbit`);
      if (!isNonEmptyString(moon.parentPlanetId) || !planetIds.has(moon.parentPlanetId)) {
        errors.push(`moon "${moon.id}" references unknown parent planet "${String(moon.parentPlanetId)}"`);
      }
    }
  }

  if (Array.isArray(hierarchy)) {
    for (const link of hierarchy) {
      if (!isObject(link) || !isNonEmptyString(link.childId) || !isNonEmptyString(link.parentId)) {
        errors.push("each hierarchy link must define non-empty childId and parentId");
        continue;
      }
      if (link.relation !== "orbits")
        errors.push(`hierarchy link "${link.childId}" must use relation "orbits"`);
      if (!planetIds.has(link.childId) && !moonIds.has(link.childId)) {
        errors.push(`hierarchy child "${link.childId}" does not reference a known planet or moon`);
      }
      if (!starIds.has(link.parentId) && !planetIds.has(link.parentId)) {
        errors.push(`hierarchy parent "${link.parentId}" does not reference a known star or planet`);
      }
    }
  }

  return errors;
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

  // Inert placeholder for the secondary star in V3→V4 migration.
  // luminosityScale: 0 makes it invisible and non-contributing; the radius
  // (0.95 × primary) is arbitrary and has no effect on the simulation output.
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
