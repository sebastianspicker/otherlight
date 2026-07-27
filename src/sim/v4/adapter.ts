/**
 * Owns adapter support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import { deepClone } from "../../core/clone";
import type { OrbitElements, PhotometryParams, SystemParams } from "../../core/types";
import { cloneParams } from "../../core/clone";
import { SCENARIO_DEFAULTS } from "../../config/defaults";
import type { MoonBodyV4, PlanetBodyV4, SimulationConfigV4, StarBodyV4 } from "./types";
import { applyDetachedBinaryPhotometryBridge, toBinaryStarPhotometry } from "./adapterPhotometry";

function applyCommonFields(base: SystemParams, config: SimulationConfigV4): void {
  base.observer = deepClone(config.observer ?? base.observer);
  base.dynamics = deepClone(config.dynamics ?? base.dynamics);
  base.didactics = deepClone(config.didactics ?? base.didactics);
}

function primaryStarParams(
  baseStar: SystemParams["star"],
  star: StarBodyV4,
  photometry?: PhotometryParams,
): SystemParams["star"] {
  return {
    ...baseStar,
    r: star.r,
    m: star.m,
    shape: star.shape,
    rings: star.rings,
    spin: star.spin,
    gravityHarmonics: star.gravityHarmonics,
    tides: star.tides,
    photometry: deepClone(photometry ?? baseStar.photometry),
  };
}

function orbitingBodyParams(
  basePlanet: SystemParams["planet"],
  body: StarBodyV4 | PlanetBodyV4,
  orbit: OrbitElements,
): SystemParams["planet"] {
  return {
    ...basePlanet,
    r: body.r,
    m: body.m,
    shape: body.shape,
    rings: body.rings,
    spin: body.spin,
    gravityHarmonics: body.gravityHarmonics,
    tides: body.tides,
    orbit: deepClone(orbit),
  };
}

function moonParams(moon: MoonBodyV4): NonNullable<SystemParams["moon"]> {
  return {
    r: moon.r,
    m: moon.m,
    shape: moon.shape,
    rings: moon.rings,
    spin: moon.spin,
    gravityHarmonics: moon.gravityHarmonics,
    tides: moon.tides,
    orbitAroundPlanet: deepClone(moon.orbit),
  };
}

function selectGeneralLabMoon(
  config: SimulationConfigV4,
  primaryPlanet: PlanetBodyV4 | undefined,
): MoonBodyV4 | undefined {
  return (
    config.bodies.moons.find((moon) => !primaryPlanet || moon.parentPlanetId === primaryPlanet.id) ??
    config.bodies.moons[0]
  );
}

function applyGeneralLabPlanet(
  base: SystemParams,
  primaryPlanet: PlanetBodyV4 | undefined,
  fallbackSecondary: StarBodyV4,
  binaryOrbit: OrbitElements,
): void {
  base.planet = primaryPlanet
    ? orbitingBodyParams(base.planet, primaryPlanet, primaryPlanet.orbit)
    : orbitingBodyParams(base.planet, fallbackSecondary, binaryOrbit);
}

function applyGeneralLabMoon(base: SystemParams, moon: MoonBodyV4 | undefined): void {
  if (moon) {
    base.moon = moonParams(moon);
    return;
  }
  delete base.moon;
}

function toGeneralLabParams(config: SimulationConfigV4): SystemParams {
  const base = cloneParams(SCENARIO_DEFAULTS);
  const starA = deepClone(config.bodies.stars[0]);
  const primaryPlanet = config.bodies.planets[0] ? deepClone(config.bodies.planets[0]) : undefined;
  const fallbackSecondary = deepClone(config.bodies.stars[1]);
  const moon = selectGeneralLabMoon(config, primaryPlanet);

  applyCommonFields(base, config);
  base.star = primaryStarParams(base.star, starA, config.photometry);
  applyGeneralLabPlanet(base, primaryPlanet, fallbackSecondary, config.orbits.binary);
  applyGeneralLabMoon(base, moon);
  return base;
}

function toDetachedBinaryParams(config: SimulationConfigV4): SystemParams {
  const base = cloneParams(SCENARIO_DEFAULTS);

  const starA = deepClone(config.bodies.stars[0]);
  const starB = deepClone(config.bodies.stars[1]);
  const binaryOrbit = deepClone(config.orbits.binary);

  applyCommonFields(base, config);
  base.star = primaryStarParams(base.star, starA, config.photometry);
  base.planet = orbitingBodyParams(base.planet, starB, binaryOrbit);

  delete base.moon;

  base.binaryStars = {
    primary: toBinaryStarPhotometry(starA),
    secondary: toBinaryStarPhotometry(starB),
  };

  applyDetachedBinaryPhotometryBridge(base, starB);
  return base;
}

export function toSystemParamsV2FromV4(config: SimulationConfigV4): SystemParams {
  if (config.mode === "general-lab") return toGeneralLabParams(config);
  return toDetachedBinaryParams(config);
}
