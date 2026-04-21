#!/usr/bin/env node
/* global console, process */

import fs from "node:fs";
import path from "node:path";

const DEFAULT_BINARY_ORBIT = {
  a: 1,
  e: 0,
  inc: Math.PI / 2,
  Omega: 0,
  omega: 0,
  period: 1,
  t0: 0,
};

function isObject(x) {
  return typeof x === "object" && x !== null;
}

function finiteOrDefault(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function sanitizeStaticOrbit(orbit, fallback = DEFAULT_BINARY_ORBIT) {
  if (typeof orbit === "function" || !orbit || typeof orbit !== "object") return { ...fallback };

  return {
    a: finiteOrDefault(orbit.a, fallback.a),
    e: finiteOrDefault(orbit.e, fallback.e),
    inc: finiteOrDefault(orbit.inc, fallback.inc),
    Omega: finiteOrDefault(orbit.Omega, fallback.Omega),
    omega: finiteOrDefault(orbit.omega, fallback.omega),
    period: finiteOrDefault(orbit.period, fallback.period),
    t0: finiteOrDefault(orbit.t0, fallback.t0),
  };
}

export function migrateSystemParamsV4(input) {
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

export function migrateScenarioJsonToV4(input) {
  if (!isObject(input)) return input;

  if (!isObject(input.defaults)) {
    return migrateSystemParamsV4(input);
  }

  const out = { ...input };
  out.defaults = migrateSystemParamsV4(input.defaults);

  if (isObject(out.meta)) {
    const meta = { ...out.meta };
    meta.version = 4;
    meta.schema = "SystemParamsV4+Controls/v4";
    out.meta = meta;
  }

  return out;
}

function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath) {
    console.error("Usage: node scripts/migrate-systemparams-v4.mjs <input.json> [output.json]");
    process.exit(1);
  }

  const absIn = path.resolve(process.cwd(), inputPath);
  const raw = fs.readFileSync(absIn, "utf8");
  const parsed = JSON.parse(raw);
  const migrated = migrateScenarioJsonToV4(parsed);
  const text = `${JSON.stringify(migrated, null, 2)}\n`;

  if (outputPath) {
    const absOut = path.resolve(process.cwd(), outputPath);
    fs.writeFileSync(absOut, text, "utf8");
  } else {
    process.stdout.write(text);
  }
}

if (process.argv[1] && process.argv[1].includes("migrate-systemparams-v4.mjs")) {
  main();
}
