// src/sim/additiveFlux.ts

import type { SystemParams } from "../core/types";
import { toFiniteNumber } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { bodyPhaseFlux } from "../photometry/phaseCurve";
import {
  orbitalPhaseFromPeriod,
  stellarVariabilityFlux,
} from "../photometry/stellarVariability";
import { computeForwardScatteringFlux } from "../photometry/forwardScattering";
import { visibleFractionWhenOcculted } from "../photometry/mutualEvents";
import type { BodyKinematics } from "./kinematics";
import { resolveOrbitElements } from "./orbits";

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
  kin: BodyKinematics
): AdditiveFluxComponents {
  const phot = params.star.photometry;
  const starRadius = params.star.r;

  const orbit = resolveOrbitElements(params.planet.orbit, t, "planet.orbit");

  // Phase / self-reflected light terms (additive).
  // Planet phase is always computed.
  let fluxPlanetOnly = bodyPhaseFlux({
    rBody: kin.rPlanetAbs,
    rBodyRadius: params.planet.r,
    rStarRadius: starRadius,
    observerDir,
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
      model: phot?.moonPhaseCurve,
      dayNightVisibility: phot?.dayNightVisibility,
    });
  }

  // Secondary eclipse: star occults the *additive* body disk when the body is behind the star.
  // (Toy model: uniform-brightness disk for the body.)
  const STAR_SKY = { x: 0, y: 0, z: 0 };

  if (fluxPlanetOnly !== 0 && kin.planetSky.z < 0) {
    const visP = visibleFractionWhenOcculted({
      targetSky: kin.planetSky,
      occulterSky: STAR_SKY,
      rTarget: params.planet.r,
      rOcculter: params.star.r,
    });
    if (Number.isFinite(visP)) fluxPlanetOnly *= visP;
  }

  if (fluxMoonOnly !== 0 && params.moon && kin.moonSky && kin.moonSky.z < 0) {
    const visM = visibleFractionWhenOcculted({
      targetSky: kin.moonSky,
      occulterSky: STAR_SKY,
      rTarget: params.moon.r,
      rOcculter: params.star.r,
    });
    if (Number.isFinite(visM)) fluxMoonOnly *= visM;
  }

  // Mutual events: scale additive self-flux by visible fraction if occulted by the other body.
  // Limitation: Mutual events assume uniform disks for the bodies, ignoring phase geometry overlap (crescent-on-crescent effects).
  let planetVisibleFraction: number | undefined;
  let moonVisibleFraction: number | undefined;

  if (params.moon && kin.moonSky) {
    // Moon in front of planet => reduce planet's additive term.
    if (fluxPlanetOnly !== 0 && kin.moonSky.z > kin.planetSky.z) {
      const visPlanet = visibleFractionWhenOcculted({
        targetSky: kin.planetSky,
        occulterSky: kin.moonSky,
        rTarget: params.planet.r,
        rOcculter: params.moon.r,
      });
      if (Number.isFinite(visPlanet)) {
        planetVisibleFraction = visPlanet;
        fluxPlanetOnly *= visPlanet;
      }
    }

    // Planet in front of moon => reduce moon's additive term.
    if (fluxMoonOnly !== 0 && kin.planetSky.z > kin.moonSky.z) {
      const visMoon = visibleFractionWhenOcculted({
        targetSky: kin.moonSky,
        occulterSky: kin.planetSky,
        rTarget: params.moon.r,
        rOcculter: params.planet.r,
      });
      if (Number.isFinite(visMoon)) {
        moonVisibleFraction = visMoon;
        fluxMoonOnly *= visMoon;
      }
    }
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
