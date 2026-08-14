/** Coordinates a synchronous simulation step across dynamics, photometry, and diagnostics. */
import type { BrightnessPatch, StepResult, SystemParams } from "../core/types";
import { toFiniteNumber } from "../core/units";
import { projectSurfacePatchesToSky } from "../photometry/stellarSurface";
import { evolveBrightnessPatches } from "../photometry/transitUniformSpots";
import { computeAdditiveFluxComponents } from "./additiveFlux";
import { isPhysicsFeatureEnabled } from "./fidelity";
import { computeBodyKinematics } from "./kinematics";
import { buildOcculters } from "./occulters";
import {
  kickoffOptionalLimbDarkeningIfRequested,
  preloadOptionalLimbDarkening,
} from "./optionalLimbDarkening";
import { assertTimeObserverContract, getObserverDir } from "./observerContract";
import { attachDidacticSignals, buildStepResult } from "./simResult";
import { computeStepTimingBundle } from "./simTiming";
import type { ObserverDir, StepFluxTerms, StepGeometry } from "./simTypes";
import { computeTransitFlux } from "./transitFlux";
import { assertStepInputs } from "./validation";

export { preloadOptionalLimbDarkening } from "./optionalLimbDarkening";
export { sampleMoonOrbitSkyAbsolute, sampleOrbitSky } from "./sampling";
export type { OrbitSampleOptions } from "./sampling";

function buildStepGeometry(params: SystemParams, t: number): StepGeometry {
  const observerDir = getObserverDir(params);
  assertTimeObserverContract({ system: params, tObs: t, observerDir });
  const kin = computeBodyKinematics(params, t, observerDir);
  return { observerDir, kin, occulters: buildOcculters(params, kin) };
}

function evolvedSpotPatches(
  phot: SystemParams["star"]["photometry"],
  t: number,
): BrightnessPatch[] | undefined {
  const patches = phot?.brightnessPatches;
  const spotModel = phot?.spotEvolution;
  if (spotModel?.enabled && Array.isArray(patches) && patches.length > 0) {
    return evolveBrightnessPatches({ patches, t, model: spotModel });
  }
  return patches;
}

function stepSpotPatches(
  params: SystemParams,
  t: number,
  observerDir: ObserverDir,
): BrightnessPatch[] | undefined {
  const phot = params.star.photometry;
  const patches = evolvedSpotPatches(phot, t);
  const project =
    isPhysicsFeatureEnabled(params, "stellarSurface") &&
    Boolean(phot?.stellarSurface?.enabled && phot.stellarSurface.useSurfacePatches);
  if (!project) return patches;
  return projectSurfacePatchesToSky({
    patches,
    t,
    tRef: phot?.spotEvolution?.tRef,
    observerDir,
    rStar: params.star.r,
    model: phot?.stellarSurface,
  });
}

function computeStepFluxTerms(params: SystemParams, t: number, geometry: StepGeometry): StepFluxTerms {
  const phot = params.star.photometry;
  const fluxTransitFactor = computeTransitFlux(params, geometry.occulters, geometry.kin, {
    brightnessPatchesOverride: stepSpotPatches(params, t, geometry.observerDir),
  });
  const additive = computeAdditiveFluxComponents(params, t, geometry.observerDir, geometry.kin);
  const baselineFluxUsed = toFiniteNumber(phot?.baselineFlux, 1.0);
  const fluxStellarVar = additive.fluxStellarVarOnly;
  const fluxPlanetPhase = additive.fluxPlanetOnly;
  const fluxMoonPhase = additive.fluxMoonOnly;
  const fluxForwardScattering = additive.fluxForwardScatteringOnly;
  const fluxRingScattering = additive.fluxRingScatteringOnly;
  const fluxRefraction = additive.fluxRefractionOnly;
  const fluxStellarPreTransit = baselineFluxUsed + fluxStellarVar;
  const fluxTotal =
    fluxStellarPreTransit * fluxTransitFactor +
    fluxPlanetPhase +
    fluxMoonPhase +
    fluxForwardScattering +
    fluxRingScattering +
    fluxRefraction;
  return {
    baselineFluxUsed,
    fluxTransitFactor,
    fluxStellarPreTransit,
    fluxTotal,
    fluxStellarVar,
    fluxPlanetPhase,
    fluxMoonPhase,
    fluxForwardScattering,
    fluxRingScattering,
    fluxRefraction,
    additive,
  };
}

/** Advance the simulation by computing all observables at time t. */
export function stepSystem(params: SystemParams, t: number): StepResult {
  assertStepInputs(params, t);
  kickoffOptionalLimbDarkeningIfRequested(params);
  const geometry = buildStepGeometry(params, t);
  const flux = computeStepFluxTerms(params, t, geometry);
  const timing = computeStepTimingBundle(params, t, geometry);
  return attachDidacticSignals(params, buildStepResult(t, geometry, flux, timing));
}

// Call once before a simulation loop if limbDarkeningModel is configured.
// stepSystem() is synchronous and cannot await dynamic imports.
export async function prepareSimulation(params: SystemParams): Promise<void> {
  if (!params.star?.photometry?.limbDarkeningModel) return;
  try {
    await preloadOptionalLimbDarkening();
  } catch (error) {
    console.warn(
      "prepareSimulation: Failed to preload limb darkening module. Simulation will proceed with Uniform/Linear fallback.",
      error,
    );
  }
}
