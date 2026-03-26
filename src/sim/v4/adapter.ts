import { deepClone } from "../../core/clone";
import type { PhotometryParams, SystemParams } from "../../core/types";
import { cloneParams } from "../../core/clone";
import { SCENARIO_DEFAULTS } from "../../config/defaults";
import type { SimulationConfigV4 } from "./types";

function ensurePhotometry(p: SystemParams): PhotometryParams {
  p.star.photometry = p.star.photometry ?? {};
  return p.star.photometry;
}

function toGeneralLabParams(config: SimulationConfigV4): SystemParams {
  const base = cloneParams(SCENARIO_DEFAULTS);
  const starA = deepClone(config.bodies.stars[0]);
  const primaryPlanet = config.bodies.planets[0] ? deepClone(config.bodies.planets[0]) : null;
  const fallbackSecondary = deepClone(config.bodies.stars[1]);

  base.observer = deepClone(config.observer ?? base.observer);
  base.star = {
    ...base.star,
    r: starA.r,
    m: starA.m,
    shape: starA.shape,
    rings: starA.rings,
    spin: starA.spin,
    gravityHarmonics: starA.gravityHarmonics,
    tides: starA.tides,
    photometry: deepClone(config.photometry ?? base.star.photometry),
  };

  if (primaryPlanet) {
    base.planet = {
      ...base.planet,
      r: primaryPlanet.r,
      m: primaryPlanet.m,
      shape: primaryPlanet.shape,
      rings: primaryPlanet.rings,
      spin: primaryPlanet.spin,
      gravityHarmonics: primaryPlanet.gravityHarmonics,
      tides: primaryPlanet.tides,
      orbit: deepClone(primaryPlanet.orbit),
    };
  } else {
    base.planet = {
      ...base.planet,
      r: fallbackSecondary.r,
      m: fallbackSecondary.m,
      shape: fallbackSecondary.shape,
      rings: fallbackSecondary.rings,
      spin: fallbackSecondary.spin,
      gravityHarmonics: fallbackSecondary.gravityHarmonics,
      tides: fallbackSecondary.tides,
      orbit: deepClone(config.orbits.binary),
    };
  }

  const moonSrc =
    config.bodies.moons.find((m) => (primaryPlanet ? m.parentPlanetId === primaryPlanet.id : true)) ??
    config.bodies.moons[0];
  if (moonSrc) {
    base.moon = {
      r: moonSrc.r,
      m: moonSrc.m,
      shape: moonSrc.shape,
      rings: moonSrc.rings,
      spin: moonSrc.spin,
      gravityHarmonics: moonSrc.gravityHarmonics,
      tides: moonSrc.tides,
      orbitAroundPlanet: deepClone(moonSrc.orbit),
    };
  } else {
    delete base.moon;
  }

  base.dynamics = deepClone(config.dynamics ?? base.dynamics);
  base.didactics = deepClone(config.didactics ?? base.didactics);
  return base;
}

function toDetachedBinaryParams(config: SimulationConfigV4): SystemParams {
  const base = cloneParams(SCENARIO_DEFAULTS);

  const starA = deepClone(config.bodies.stars[0]);
  const starB = deepClone(config.bodies.stars[1]);
  const binaryOrbit = deepClone(config.orbits.binary);

  base.observer = deepClone(config.observer ?? base.observer);

  base.star = {
    ...base.star,
    r: starA.r,
    m: starA.m,
    shape: starA.shape,
    rings: starA.rings,
    spin: starA.spin,
    gravityHarmonics: starA.gravityHarmonics,
    tides: starA.tides,
    photometry: deepClone(config.photometry ?? base.star.photometry),
  };

  base.planet = {
    ...base.planet,
    r: starB.r,
    m: starB.m,
    shape: starB.shape,
    rings: starB.rings,
    spin: starB.spin,
    gravityHarmonics: starB.gravityHarmonics,
    tides: starB.tides,
    orbit: binaryOrbit,
  };

  delete base.moon;

  base.dynamics = deepClone(config.dynamics ?? base.dynamics);
  base.didactics = deepClone(config.didactics ?? base.didactics);

  const phot = ensurePhotometry(base);
  const luminosity = Number.isFinite(starB.luminosityScale)
    ? Math.max(0, starB.luminosityScale as number)
    : 0.25;

  // Detached-binary bridge in legacy kernel:
  // secondary luminous star is represented as additive constant on the mapped orbiting body.
  phot.phaseCurve = {
    enabled: true,
    reflAmp: 0,
    thermAmp: 0,
    reflOffset: 0,
    thermOffset: 0,
    lambertian: false,
    constant: luminosity,
    physicalScaling: false,
  };

  return base;
}

export function toSystemParamsV2FromV4(config: SimulationConfigV4): SystemParams {
  if (config.mode === "general-lab") return toGeneralLabParams(config);
  return toDetachedBinaryParams(config);
}
