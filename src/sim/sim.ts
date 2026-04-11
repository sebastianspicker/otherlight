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

import type { StepResult, StepTimingDiagnostics, SystemParams } from "../core/types";
import { toFiniteNumber } from "../core/units";
import { assertStepInputs } from "./validation";
import {
  kickoffOptionalLimbDarkeningIfRequested,
  preloadOptionalLimbDarkening,
} from "./optionalLimbDarkening";
import { getObserverDir } from "./observerContract";
import { computeBodyKinematics } from "./kinematics";
import { buildOcculters } from "./occulters";
import { computeTransitFlux } from "./transitFlux";
import { evolveBrightnessPatches } from "../photometry/transitUniformSpots";
import { computeAdditiveFluxComponents } from "./additiveFlux";
import { computeExoDiagnostics } from "./diagnostics";
import { computeStepObservables } from "./observables";
import { computeTransitTimingDiagnostics } from "./transitTiming";
import { projectSurfacePatchesToSky } from "../photometry/stellarSurface";
import { assertTimeObserverContract } from "./observerContract";
import { isPhysicsFeatureEnabled } from "./fidelity";
import { getDidacticsHook } from "./didacticsHook";

export { preloadOptionalLimbDarkening } from "./optionalLimbDarkening";
export { sampleOrbitSky, sampleMoonOrbitSkyAbsolute } from "./sampling";
export type { OrbitSampleOptions } from "./sampling";

function mapTimingSolveDiagnostics(
  timingSolve: ReturnType<typeof computeBodyKinematics>["timingSolve"],
): NonNullable<StepResult["meta"]>["timingConvergence"] {
  if (!timingSolve) return undefined;
  return {
    planet: timingSolve.planet && {
      status: timingSolve.planet.status,
      converged: timingSolve.planet.converged,
      iterations: timingSolve.planet.iterations,
      maxIters: timingSolve.planet.maxIters,
      tolSec: timingSolve.planet.tolSec,
      usedShapiro: timingSolve.planet.usedShapiro,
      usedMultiBodyShapiro: timingSolve.planet.usedMultiBodyShapiro,
      validityFlags: [...timingSolve.planet.validityFlags],
      roemerSec: timingSolve.planet.roemerSec,
      shapiroSec: timingSolve.planet.shapiroSec,
      delaySec: timingSolve.planet.delaySec,
      residualSec: timingSolve.planet.residualSec,
    },
    moon: timingSolve.moon && {
      status: timingSolve.moon.status,
      converged: timingSolve.moon.converged,
      iterations: timingSolve.moon.iterations,
      maxIters: timingSolve.moon.maxIters,
      tolSec: timingSolve.moon.tolSec,
      usedShapiro: timingSolve.moon.usedShapiro,
      usedMultiBodyShapiro: timingSolve.moon.usedMultiBodyShapiro,
      validityFlags: [...timingSolve.moon.validityFlags],
      roemerSec: timingSolve.moon.roemerSec,
      shapiroSec: timingSolve.moon.shapiroSec,
      delaySec: timingSolve.moon.delaySec,
      residualSec: timingSolve.moon.residualSec,
    },
  };
}

/**
 * Advance the simulation by computing all observables at time t.
 *
 * Computes body kinematics (Kepler + optional N-body), transit flux
 * (uniform/LD/transmission), additive flux components (phase curves,
 * stellar variability, forward scattering), timing diagnostics, and
 * didactic signals.
 *
 * @param params Full system configuration (star, planet, moon, photometry, dynamics).
 * @param t Observation time [s] since epoch.
 * @returns Composite step result with flux, kinematics, timing, and render signals.
 */
export function stepSystem(params: SystemParams, t: number): StepResult {
  assertStepInputs(params, t);

  // Best-effort background load so later steps can use LD if caller forgot to await prepareSimulation().
  kickoffOptionalLimbDarkeningIfRequested(params);

  const observerDir = getObserverDir(params);
  assertTimeObserverContract({ system: params, tObs: t, observerDir });
  const kin = computeBodyKinematics(params, t, observerDir);
  const occulters = buildOcculters(params, kin);

  const phot = params.star.photometry;
  const spotModel = phot?.spotEvolution;
  const evolvedPatches =
    spotModel?.enabled && Array.isArray(phot?.brightnessPatches) && phot.brightnessPatches.length > 0
      ? evolveBrightnessPatches({ patches: phot.brightnessPatches, t, model: spotModel })
      : phot?.brightnessPatches;
  const spotPatches =
    isPhysicsFeatureEnabled(params, "stellarSurface") &&
    phot?.stellarSurface?.enabled &&
    phot.stellarSurface.useSurfacePatches
      ? projectSurfacePatchesToSky({
          patches: evolvedPatches,
          t,
          tRef: spotModel?.tRef,
          observerDir,
          rStar: params.star.r,
          model: phot.stellarSurface,
        })
      : evolvedPatches;
  // BUG FIX: Brightness patches are forwarded to the transit integrator via
  // brightnessPatchesOverride (below), which already accounts for their
  // effect internally.  Previously, spotFluxFactor was also computed from
  // the same patches and multiplied into the pre-transit baseline, causing
  // the patch effect to be double-counted.  Since patches are always
  // forwarded to the transit integrator, spotFluxFactor must be 1 here.
  const spotFluxFactor = 1;

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
  const fluxRingScattering = additive.fluxRingScatteringOnly;

  const fluxStellarPreTransit = baselineFluxUsed * spotFluxFactor + fluxStellarVar;

  // Physically consistent composition: stellar term is attenuated, additive terms are not.
  // Assumption: Stellar variability is photospheric.
  const fluxTotal =
    fluxStellarPreTransit * fluxTransitFactor +
    (fluxPlanetPhase + fluxMoonPhase + fluxForwardScattering + fluxRingScattering);

  const exoDiag = computeExoDiagnostics(params, t, observerDir, kin);
  const observables = computeStepObservables(params, t, observerDir, kin);
  const dynamicTiming = computeTransitTimingDiagnostics(params, t, observerDir, kin);
  const mergedTiming: StepTimingDiagnostics = {
    ...(observables?.timing ?? {}),
    ...(dynamicTiming.timing ?? {}),
  };
  const timing = Object.values(mergedTiming).some((v) => typeof v === "number" && Number.isFinite(v))
    ? mergedTiming
    : undefined;
  const conservation = observables?.conservation;

  const stepBase: StepResult = {
    // UI robustness: never return NaN/Inf; fail-open to 1.0 (normalized no-event level).
    fluxTotal: toFiniteNumber(fluxTotal, 1.0),
    fluxTransitFactor,
    fluxStellarPreTransit,
    fluxStellarVar,
    fluxPlanetPhase,
    fluxMoonPhase,
    fluxForwardScattering,
    fluxRingScattering,
    planetSky: kin.planetSky,
    moonSky: kin.moonSky,
    meta: {
      t,
      nOcculters: occulters.length,
      planetVisibleFraction: additive.planetVisibleFraction,
      moonVisibleFraction: additive.moonVisibleFraction,
      stellarVariabilityFlux: fluxStellarVar,
      forwardScatteringFlux: fluxForwardScattering,
      ringScatteringFlux: fluxRingScattering,
      baselineFluxUsed,
      vPlanetSky: exoDiag.vPlanetSky,
      vPlanetSkyRef: exoDiag.vPlanetSkyRef,
      tdvRatio: exoDiag.tdvRatio,
      bPlanet: exoDiag.bPlanet,
      bMoon: exoDiag.bMoon,
      observables,
      timing,
      eventTimingConvergence: dynamicTiming.eventTimingConvergence,
      timingConvergence: mapTimingSolveDiagnostics(kin.timingSolve),
      conservation,
      fluxDecomposition: {
        stellarA: baselineFluxUsed * spotFluxFactor * fluxTransitFactor,
        stellarB: 0, // V3 has no secondary star, so stellarB is always 0.
        binaryEclipseTerms: fluxTransitFactor,
        additivePlanetary: fluxPlanetPhase + fluxForwardScattering + fluxRingScattering,
        additiveLunar: fluxMoonPhase,
        instrumental: 0,
        stellarPreTransit: fluxStellarPreTransit,
        stellarVariability: fluxStellarVar,
        transitFactor: fluxTransitFactor,
        planetPhase: fluxPlanetPhase,
        moonPhase: fluxMoonPhase,
        forwardScattering: fluxForwardScattering,
        ringScattering: fluxRingScattering,
        total: toFiniteNumber(fluxTotal, 1.0),
      },
    },
  };

  const didacticsHook = getDidacticsHook();
  const didacticSignals = didacticsHook ? didacticsHook(params, stepBase) : undefined;

  return didacticSignals && stepBase.meta
    ? { ...stepBase, meta: { ...stepBase.meta, didacticSignals } }
    : stepBase;
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
        e,
      );
    }
  }
}
