// src/sim/sim.ts

//
// Slim orchestrator around the simulation pipeline.
//
// Responsibilities:
// - Validate inputs (fail fast).
// - Ensure optional limb-darkening module is preloaded (async) or kicked off (sync best-effort).
// - Compute body kinematics and sky-plane projections.
// - Build occulters (planet/moon silhouettes).
// - Compute transit attenuation factor (multiplicative on stellar flux).
// - Compute additive flux components (planet/moon phase, forward scattering, stellar variability, etc.).
// - Combine to total flux with a physically consistent contract:
//
// F_total(t) = (baselineFlux + stellarVariability) * F_transit(t) + (planetPhase + moonPhase + forwardScattering)
//
// Assumptions:
// - Stellar variability (fluxStellarVar) is treated as photospheric (originating from the star's surface),
//   so it IS attenuated by the transit factor.
// - Planet/Moon phases are additive (reflected/emitted light) and NOT attenuated by the transit factor
//   (assuming the transiting body doesn't eclipse the other body's phase, which is handled in mutual events separately if needed).
//
// Notes:
// - stepSystem() is synchronous by design (simulation stepping).
// - Optional limb darkening requires prepareSimulation() to be awaited for deterministic usage.

import type { StepResult, SystemParams } from "../core/types";
import { toFiniteNumber } from "../core/units";
import { assertStepInputs } from "./validation";
import {
  kickoffOptionalLimbDarkeningIfRequested,
  preloadOptionalLimbDarkening,
} from "./optionalLimbDarkening";
import { getObserverDir } from "./observer";
import { computeBodyKinematics } from "./kinematics";
import { buildOcculters } from "./occulters";
import { computeTransitFlux } from "./transitFlux";
import {
  evolveBrightnessPatches,
  spotFluxFactorFromPatches,
} from "../photometry/transitUniformSpots";
import { computeAdditiveFluxComponents } from "./additiveFlux";
import { computeExoDiagnostics } from "./diagnostics";

export { preloadOptionalLimbDarkening } from "./optionalLimbDarkening";
export { sampleOrbitSky, sampleMoonOrbitSkyAbsolute } from "./sampling";
export type { OrbitSampleOptions } from "./sampling";

export function stepSystem(params: SystemParams, t: number): StepResult {
  assertStepInputs(params, t);

  // Best-effort background load so later steps can use LD if caller forgot to await prepareSimulation().
  kickoffOptionalLimbDarkeningIfRequested(params);

  const observerDir = getObserverDir(params);
  const kin = computeBodyKinematics(params, t, observerDir);
  const occulters = buildOcculters(params, kin);

  const phot = params.star.photometry;
  const spotModel = phot?.spotEvolution;
  const spotPatches =
    spotModel?.enabled && Array.isArray(phot?.brightnessPatches) && phot.brightnessPatches.length > 0
      ? evolveBrightnessPatches({ patches: phot.brightnessPatches, t, model: spotModel })
      : undefined;
  const spotFluxFactor =
    spotModel?.enabled && spotPatches && spotPatches.length > 0
      ? spotFluxFactorFromPatches({ rStar: params.star.r, patches: spotPatches, gridRes: phot?.gridRes })
      : 1;

  // Multiplicative stellar attenuation factor in [0,1].
  const fluxTransitFactor = computeTransitFlux(params, occulters, kin, {
    brightnessPatchesOverride: spotPatches,
  });

  // Additive (non-stellar-surface) terms and stellar variability term.
  const additive = computeAdditiveFluxComponents(params, t, observerDir, kin);

  const baselineFluxUsed = toFiniteNumber(phot?.baselineFlux, 1.0);
  const fluxStellarVar = additive.fluxStellarVarOnly;
  const fluxPlanetPhase = additive.fluxPlanetOnly;
  const fluxMoonPhase = additive.fluxMoonOnly;
  const fluxForwardScattering = additive.fluxForwardScatteringOnly;

  const fluxStellarPreTransit = baselineFluxUsed * spotFluxFactor + fluxStellarVar;

  // Physically consistent composition: stellar term is attenuated, additive terms are not.
  // Assumption: Stellar variability is photospheric.
  const fluxTotal =
    fluxStellarPreTransit * fluxTransitFactor +
    (fluxPlanetPhase + fluxMoonPhase + fluxForwardScattering);

  const exoDiag = computeExoDiagnostics(params, t, observerDir, kin);

  return {
    // UI robustness: never return NaN/Inf; fail-open to 1.0 (normalized no-event level).
    fluxTotal: toFiniteNumber(fluxTotal, 1.0),
    fluxTransitFactor,
    fluxStellarPreTransit,
    fluxStellarVar,
    fluxPlanetPhase,
    fluxMoonPhase,
    fluxForwardScattering,
    planetSky: kin.planetSky,
    moonSky: kin.moonSky,
    meta: {
      t,
      nOcculters: occulters.length,
      planetVisibleFraction: additive.planetVisibleFraction,
      moonVisibleFraction: additive.moonVisibleFraction,
      stellarVariabilityFlux: fluxStellarVar,
      forwardScatteringFlux: fluxForwardScattering,
      baselineFluxUsed,
      vPlanetSky: exoDiag.vPlanetSky,
      vPlanetSkyRef: exoDiag.vPlanetSkyRef,
      tdvRatio: exoDiag.tdvRatio,
      bPlanet: exoDiag.bPlanet,
      bMoon: exoDiag.bMoon,
    },
  };
}

// Call once before a simulation loop if limbDarkeningModel is configured.
// stepSystem() is synchronous and cannot await dynamic imports.
export async function prepareSimulation(params: SystemParams): Promise<void> {
  const ldModel = params.star?.photometry?.limbDarkeningModel;

  if (ldModel) {
    try {
      await preloadOptionalLimbDarkening();
    } catch (e) {
      console.warn(
        "prepareSimulation: Failed to preload limb darkening module. Simulation will proceed with Uniform/Linear fallback.",
        e
      );
    }
  }
}
