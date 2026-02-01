// src/sim/additiveFlux.ts

import type { SystemParams } from "../core/types";
import { toFiniteNumber } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { bodyPhaseFlux } from "../photometry/phaseCurve";
import { orbitalPhaseFromPeriod, stellarVariabilityFlux } from "../photometry/stellarVariability";
import { computeForwardScatteringFlux } from "../photometry/forwardScattering";
import { visibleFractionWhenOcculted } from "../photometry/mutualEvents";
import { fluxUniformDisk } from "../photometry/transitUniform";
import type { CircleOcculter } from "../photometry/occulterCircle";
import type { BodyKinematics } from "./kinematics";
import { resolveOrbitElements } from "./orbits";

const MUTUAL_OCCULTER_GRID_RES = 120;

function addOcculterIfFront(
  occulters: CircleOcculter[],
  targetSky: { x: number; y: number; z: number },
  occulterSky: { x: number; y: number; z: number },
  rOcculter: number,
): void {
  if (!Number.isFinite(rOcculter) || rOcculter <= 0) return;
  if (
    !Number.isFinite(targetSky.x) ||
    !Number.isFinite(targetSky.y) ||
    !Number.isFinite(targetSky.z) ||
    !Number.isFinite(occulterSky.x) ||
    !Number.isFinite(occulterSky.y) ||
    !Number.isFinite(occulterSky.z)
  ) {
    return;
  }

  if (!(occulterSky.z > targetSky.z)) return;

  occulters.push({
    dx: occulterSky.x - targetSky.x,
    dy: occulterSky.y - targetSky.y,
    r: rOcculter,
  });
}

function visibleFractionWithOcculters(rTarget: number, occulters: CircleOcculter[]): number {
  if (!Number.isFinite(rTarget) || rTarget <= 0) return 1;
  if (occulters.length === 0) return 1;

  try {
    return fluxUniformDisk({
      rStar: rTarget,
      rOcculters: occulters,
      gridRes: MUTUAL_OCCULTER_GRID_RES,
    });
  } catch {
    return 1;
  }
}

export type AdditiveFluxComponents = {
  fluxPlanetOnly: number;
  fluxMoonOnly: number;
  fluxStellarVarOnly: number;
  fluxForwardScatteringOnly: number;
  planetVisibleFraction?: number;
  moonVisibleFraction?: number;
};

export function computeAdditiveFluxComponents(
  params: SystemParams,
  t: number,
  observerDir: Vec3,
  kin: BodyKinematics,
): AdditiveFluxComponents {
  const phot = params.star.photometry;
  const starRadius = params.star.r;

  const orbit = kin.planetOrbit ?? resolveOrbitElements(params.planet.orbit, t, "planet.orbit");

  // Phase / self-reflected light terms (additive).
  // Planet phase is always computed.
  let fluxPlanetOnly = bodyPhaseFlux({
    rBody: kin.rPlanetAbs,
    rBodyRadius: params.planet.r,
    rStarRadius: starRadius,
    observerDir,
    orbitPeriodSec: orbit.period,
    model: phot?.phaseCurve,
    dayNightVisibility: phot?.dayNightVisibility,
  });

  // Moon phase is optional.
  let fluxMoonOnly = 0;
  if (params.moon && kin.rMoonAbs) {
    fluxMoonOnly = bodyPhaseFlux({
      rBody: kin.rMoonAbs,
      rBodyRadius: params.moon.r,
      rStarRadius: starRadius,
      observerDir,
      orbitPeriodSec: orbit.period,
      model: phot?.moonPhaseCurve,
      dayNightVisibility: phot?.dayNightVisibility,
    });
  }

  // Mutual events: compute visible fractions for diagnostics.
  // Limitation: Mutual events assume uniform disks for the bodies, ignoring phase geometry overlap (crescent-on-crescent effects).
  let planetVisibleFraction: number | undefined;
  let moonVisibleFraction: number | undefined;

  if (params.moon && kin.moonSky) {
    // Moon in front of planet => diagnostic visible fraction.
    if (fluxPlanetOnly !== 0 && kin.moonSky.z > kin.planetSky.z) {
      const visPlanet = visibleFractionWhenOcculted({
        targetSky: kin.planetSky,
        occulterSky: kin.moonSky,
        rTarget: params.planet.r,
        rOcculter: params.moon.r,
      });
      if (Number.isFinite(visPlanet)) {
        planetVisibleFraction = visPlanet;
      }
    }

    // Planet in front of moon => diagnostic visible fraction.
    if (fluxMoonOnly !== 0 && kin.planetSky.z > kin.moonSky.z) {
      const visMoon = visibleFractionWhenOcculted({
        targetSky: kin.moonSky,
        occulterSky: kin.planetSky,
        rTarget: params.moon.r,
        rOcculter: params.planet.r,
      });
      if (Number.isFinite(visMoon)) {
        moonVisibleFraction = visMoon;
      }
    }
  }

  // Secondary eclipse + mutual events combined: use union-of-occulters for accurate visible fraction.
  // (Toy model: uniform-brightness disk for the body.)
  const STAR_SKY = { x: 0, y: 0, z: 0 };

  if (fluxPlanetOnly !== 0) {
    const planetOcculters: CircleOcculter[] = [];
    addOcculterIfFront(planetOcculters, kin.planetSky, STAR_SKY, starRadius);
    if (params.moon && kin.moonSky) {
      addOcculterIfFront(planetOcculters, kin.planetSky, kin.moonSky, params.moon.r);
    }
    const planetVis = visibleFractionWithOcculters(params.planet.r, planetOcculters);
    if (Number.isFinite(planetVis)) fluxPlanetOnly *= planetVis;
  }

  if (fluxMoonOnly !== 0 && params.moon && kin.moonSky) {
    const moonOcculters: CircleOcculter[] = [];
    addOcculterIfFront(moonOcculters, kin.moonSky, STAR_SKY, starRadius);
    addOcculterIfFront(moonOcculters, kin.moonSky, kin.planetSky, params.planet.r);
    const moonVis = visibleFractionWithOcculters(params.moon.r, moonOcculters);
    if (Number.isFinite(moonVis)) fluxMoonOnly *= moonVis;
  }

  // Stellar variability is an emitted stellar term (added to baseline) that will be multiplied by F_transit upstream.
  const fluxStellarVarOnly = stellarVariabilityFlux({
    t,
    orbit,
    model: phot?.stellarVariability,
  });

  // Forward scattering (additive). Modeled only for the planet in this UI schema.
  const phase = orbitalPhaseFromPeriod({
    t,
    period: orbit.period,
    t0: orbit.t0,
  });
  const fluxForwardScatteringOnly = computeForwardScatteringFlux({
    rBody: kin.rPlanetAbs,
    observerDir,
    model: phot?.forwardScattering,
    phase: Number.isFinite(phase) ? phase : undefined,
  });

  // Robustness: enforce finite outputs (fail-open to 0 for additive components).
  return {
    fluxPlanetOnly: toFiniteNumber(fluxPlanetOnly, 0),
    fluxMoonOnly: toFiniteNumber(fluxMoonOnly, 0),
    fluxStellarVarOnly: toFiniteNumber(fluxStellarVarOnly, 0),
    fluxForwardScatteringOnly: toFiniteNumber(fluxForwardScatteringOnly, 0),
    planetVisibleFraction,
    moonVisibleFraction,
  };
}
