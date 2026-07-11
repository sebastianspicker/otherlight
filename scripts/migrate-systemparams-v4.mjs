#!/usr/bin/env node
/* global console, process */

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

function finitePositiveOrDefault(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteEccentricityOrDefault(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1 ? value : fallback;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function sanitizeStaticOrbit(orbit, fallback = DEFAULT_BINARY_ORBIT) {
  if (typeof orbit === "function" || !orbit || typeof orbit !== "object") return { ...fallback };

  return {
    a: finitePositiveOrDefault(orbit.a, fallback.a),
    e: finiteEccentricityOrDefault(orbit.e, fallback.e),
    inc: finiteOrDefault(orbit.inc, fallback.inc),
    Omega: finiteOrDefault(orbit.Omega, fallback.Omega),
    omega: finiteOrDefault(orbit.omega, fallback.omega),
    period: finitePositiveOrDefault(orbit.period, fallback.period),
    t0: finiteOrDefault(orbit.t0, fallback.t0),
  };
}

function sanitizeBinaryStarPhotometry(photometry, fallback) {
  const out = {
    luminosityScale: Number.isFinite(photometry?.luminosityScale)
      ? Math.max(0, photometry.luminosityScale)
      : fallback.luminosityScale,
  };
  if (Number.isFinite(photometry?.teffK)) out.teffK = photometry.teffK;
  if (Number.isFinite(photometry?.loggCgs)) out.loggCgs = photometry.loggCgs;
  if (Number.isFinite(photometry?.metallicityDex)) out.metallicityDex = photometry.metallicityDex;
  const passband = isNonEmptyString(photometry?.passband)
    ? photometry.passband
    : isNonEmptyString(fallback.passband)
      ? fallback.passband
      : undefined;
  if (passband) out.passband = passband;
  return out;
}

export function migrateSystemParamsV4(input) {
  const primary = migratePrimaryStar(input);
  const secondary = migrateSecondaryStar(input);
  const binary = sanitizeStaticOrbit(input.planet?.orbit, DEFAULT_BINARY_ORBIT);
  const moons = migrateMoons(input);

  return {
    version: "4",
    mode: "general-lab",
    runtime: { mode: "realtime", referenceSubsteps: 5, executionMode: "interactive" },
    observer: input.observer,
    binaryLab: migratedBinaryLabConfig(),
    bodies: {
      stars: [primary, secondary],
      planets: [migratePlanet(input, binary)],
      moons,
    },
    orbits: {
      binary,
      hierarchy: migrateHierarchy(moons),
    },
    photometry: input.star?.photometry,
    dynamics: input.dynamics,
    didactics: input.didactics,
  };
}

function migratePrimaryStar(input) {
  const fallbackPassband = fallbackStarPassband(input);
  const primaryPhotometry = sanitizeBinaryStarPhotometry(
    {
      ...stellarAtmosphereSeed(input),
      passband: fallbackPassband,
      ...input.binaryStars?.primary,
    },
    { luminosityScale: 1, passband: fallbackPassband },
  );
  return {
    ...sharedStarFields(input),
    id: "star-a",
    r: input.star?.r ?? 1,
    ...primaryPhotometry,
  };
}

function migrateSecondaryStar(input) {
  const fallbackPassband = fallbackStarPassband(input);
  return {
    ...sharedStarFields(input),
    id: "star-b",
    r: Math.max(0, (input.star?.r ?? 1) * 0.95),
    m: 0,
    ...sanitizeBinaryStarPhotometry(input.binaryStars?.secondary, {
      luminosityScale: 0,
      passband: fallbackPassband,
    }),
  };
}

function fallbackStarPassband(input) {
  return input.star?.photometry?.limbDarkeningModel?.bandpass;
}

function stellarAtmosphereSeed(input) {
  const stellar = input.star?.photometry?.limbDarkeningModel?.stellar;
  return {
    teffK: stellar?.teffK,
    loggCgs: stellar?.loggCgs,
    metallicityDex: stellar?.metallicityDex,
  };
}

function sharedStarFields(input) {
  return {
    m: input.star?.m,
    shape: input.star?.shape,
    rings: input.star?.rings,
    spin: input.star?.spin,
    gravityHarmonics: input.star?.gravityHarmonics,
    tides: input.star?.tides,
  };
}

function migratePlanet(input, binary) {
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
}

function migrateMoons(input) {
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
      orbit: sanitizeStaticOrbit(input.moon.orbitAroundPlanet, DEFAULT_BINARY_ORBIT),
      parentPlanetId: "planet-1",
    },
  ];
}

function migrateHierarchy(moons) {
  return [
    { childId: "planet-1", parentId: "star-a", relation: "orbits" },
    ...moons.map((moon) => ({ childId: moon.id, parentId: moon.parentPlanetId, relation: "orbits" })),
  ];
}

function migratedBinaryLabConfig() {
  return {
    enabled: true,
    hideSkyUntilReveal: true,
    requireHypothesis: true,
    lockParamsUntilHypothesis: true,
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

async function readStdin() {
  process.stdin.setEncoding("utf8");
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    console.error("Usage: node scripts/migrate-systemparams-v4.mjs < input.json > output.json");
    process.exit(1);
  }

  const raw = await readStdin();
  if (raw.trim().length === 0) {
    console.error("Usage: node scripts/migrate-systemparams-v4.mjs < input.json > output.json");
    process.exit(1);
  }

  const parsed = JSON.parse(raw);
  const migrated = migrateScenarioJsonToV4(parsed);
  const text = `${JSON.stringify(migrated, null, 2)}\n`;
  process.stdout.write(text);
}

if (process.argv[1] && process.argv[1].includes("migrate-systemparams-v4.mjs")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
