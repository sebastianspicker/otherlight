#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

type OrbitLike = {
  a?: unknown;
  e?: unknown;
  inc?: unknown;
  Omega?: unknown;
  omega?: unknown;
  period?: unknown;
  t0?: unknown;
};

const DEFAULT_BINARY_ORBIT = {
  a: 1,
  e: 0,
  inc: Math.PI / 2,
  Omega: 0,
  omega: 0,
  period: 1,
  t0: 0,
};

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function finiteOrDefault(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function sanitizeStaticOrbit(orbit: unknown, fallback = DEFAULT_BINARY_ORBIT) {
  if (typeof orbit === "function" || !orbit || typeof orbit !== "object") return { ...fallback };

  const src = orbit as OrbitLike;
  return {
    a: finiteOrDefault(src.a, fallback.a),
    e: finiteOrDefault(src.e, fallback.e),
    inc: finiteOrDefault(src.inc, fallback.inc),
    Omega: finiteOrDefault(src.Omega, fallback.Omega),
    omega: finiteOrDefault(src.omega, fallback.omega),
    period: finiteOrDefault(src.period, fallback.period),
    t0: finiteOrDefault(src.t0, fallback.t0),
  };
}

export function migrateSystemParamsV4(input: Record<string, any>) {
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
  const binary = sanitizeStaticOrbit(input.planet?.orbit, DEFAULT_BINARY_ORBIT);
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
      parentSystem: "star",
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
          orbit: sanitizeStaticOrbit(input.moon.orbitAroundPlanet, DEFAULT_BINARY_ORBIT),
          parentPlanetId: "planet-1",
        },
      ]
    : [];
  const hierarchy = [
    { childId: "planet-1", parentId: "star-a", relation: "orbits" },
    ...moons.map((moon) => ({ childId: moon.id, parentId: moon.parentPlanetId, relation: "orbits" })),
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

export function migrateScenarioJsonToV4(input: unknown): unknown {
  if (!isObject(input)) return input;

  if (!isObject((input as Record<string, unknown>).defaults)) {
    return migrateSystemParamsV4(input as Record<string, any>);
  }

  const out = { ...input } as Record<string, unknown>;
  out.defaults = migrateSystemParamsV4((input as { defaults: Record<string, any> }).defaults);

  if (isObject(out.meta)) {
    const meta = { ...out.meta } as Record<string, unknown>;
    meta.version = 4;
    meta.schema = "SystemParamsV4+Controls/v4";
    out.meta = meta;
  }

  return out;
}

function main(): void {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath) {
    console.error(
      "Usage: node --experimental-strip-types scripts/migrate-systemparams-v4.ts <input.json> [output.json]",
    );
    process.exit(1);
  }

  const absIn = path.resolve(process.cwd(), inputPath);
  const raw = fs.readFileSync(absIn, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const migrated = migrateScenarioJsonToV4(parsed);
  const text = `${JSON.stringify(migrated, null, 2)}\n`;

  if (outputPath) {
    const absOut = path.resolve(process.cwd(), outputPath);
    fs.writeFileSync(absOut, text, "utf8");
  } else {
    process.stdout.write(text);
  }
}

if (process.argv[1] && process.argv[1].includes("migrate-systemparams-v4.ts")) {
  main();
}
