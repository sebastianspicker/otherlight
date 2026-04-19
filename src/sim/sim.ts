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

import type {
  StepAdvancedTimingDiagnostics,
  StepResult,
  StepTimingDiagnostics,
  SystemParams,
} from "../core/types";
import { G_SI, toFiniteNumber } from "../core/units";
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
import { resolveDynamicSystemState } from "./systemState";
import { getNBodyStateAt, isNBodyEnabled } from "./dynamics";
import {
  einsteinDelaySurrogateSec,
  lightBendingAngleRad,
  normalizeRelativityParams,
} from "../physics/relativity";
import { muFromPeriodAndA } from "../physics/kepler";
import { resolvePlanetOrbitForKinematics } from "./kinematics";

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

function resolveObserverClockOffsetSec(params: SystemParams, tObsSec: number): number {
  const tk = params.observer?.timekeeping;
  if (!tk?.enabled) return 0;
  const constant = Number.isFinite(tk.barycentricOffsetSec) ? (tk.barycentricOffsetSec as number) : 0;
  const amp = Number.isFinite(tk.periodicErrorAmpSec) ? (tk.periodicErrorAmpSec as number) : 0;
  const periodSec = Number.isFinite(tk.periodSec) ? (tk.periodSec as number) : Number.NaN;
  const phaseSec = Number.isFinite(tk.phaseSec) ? (tk.phaseSec as number) : 0;
  const periodic =
    Number.isFinite(amp) && amp !== 0 && Number.isFinite(periodSec) && periodSec > 0
      ? amp * Math.sin((2 * Math.PI * (tObsSec - phaseSec)) / periodSec)
      : 0;
  const offset = constant + periodic;
  return Number.isFinite(offset) ? offset : 0;
}

function applyClockOffsetToTiming(
  timing: StepTimingDiagnostics | undefined,
  offsetSec: number,
): StepTimingDiagnostics | undefined {
  if (!timing || !Number.isFinite(offsetSec) || offsetSec === 0) return timing;
  const shift = (value: number | undefined): number | undefined =>
    Number.isFinite(value) ? (value as number) + offsetSec : value;
  return {
    ...timing,
    barycentricClockOffsetSec: offsetSec,
    planetTransitCenterSec: shift(timing.planetTransitCenterSec),
    planetIngressSec: shift(timing.planetIngressSec),
    planetEgressSec: shift(timing.planetEgressSec),
    planetTtvSec: timing.planetTtvSec,
    moonTransitCenterSec: shift(timing.moonTransitCenterSec),
    moonIngressSec: shift(timing.moonIngressSec),
    moonEgressSec: shift(timing.moonEgressSec),
    moonTtvSec: timing.moonTtvSec,
  };
}

function deriveCentralMu(params: SystemParams, tObsSec: number): number | undefined {
  if (Number.isFinite(params.star.m) && (params.star.m as number) > 0) {
    return G_SI * (params.star.m as number);
  }
  try {
    const orbit = resolvePlanetOrbitForKinematics(params, tObsSec, "planet.orbit");
    const mu = muFromPeriodAndA(orbit.period, orbit.a);
    return Number.isFinite(mu) && mu > 0 ? mu : undefined;
  } catch {
    return undefined;
  }
}

function currentCloseEncounterDistance(params: SystemParams, tObsSec: number): number | undefined {
  if (!isNBodyEnabled(params)) return undefined;
  const sample = getNBodyStateAt(params, tObsSec);
  if (!sample) return undefined;
  const bodies = [
    sample.state.rS,
    sample.state.rP,
    sample.state.rM,
    ...(sample.state.perturbers?.map((p) => p.r) ?? []),
  ];
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const dz = bodies[j].z - bodies[i].z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (Number.isFinite(d) && d < best) best = d;
    }
  }
  return Number.isFinite(best) ? best : undefined;
}

function computeAdvancedTimingDiagnostics(
  params: SystemParams,
  tObsSec: number,
  observerDir: ReturnType<typeof getObserverDir>,
  kin: ReturnType<typeof computeBodyKinematics>,
  clockOffsetSec: number,
): StepAdvancedTimingDiagnostics | undefined {
  const rel = normalizeRelativityParams(params.dynamics?.relativity);
  const mu = deriveCentralMu(params, tObsSec);
  const dynamic = resolveDynamicSystemState({ system: params, tObs: tObsSec, observerDir, kinAtT: kin });
  const validityFlags: string[] = [];

  const einsteinPlanetSec =
    rel.einsteinDelay && mu
      ? einsteinDelaySurrogateSec({
          r: dynamic.planet.r,
          v: dynamic.planet.v,
          mu,
          c: rel.c,
          tObs: tObsSec,
          tRef: rel.timingRefSec,
        })
      : undefined;
  const einsteinMoonSec =
    rel.einsteinDelay && mu && dynamic.moon
      ? einsteinDelaySurrogateSec({
          r: dynamic.moon.r,
          v: dynamic.moon.v,
          mu,
          c: rel.c,
          tObs: tObsSec,
          tRef: rel.timingRefSec,
        })
      : undefined;

  const lightBendingPlanetRad =
    rel.lightBending && mu
      ? lightBendingAngleRad({
          r: dynamic.planet.r,
          observerDir,
          mu,
          c: rel.c,
          minImpact: rel.shapiroMinImpact,
        })
      : undefined;
  const lightBendingMoonRad =
    rel.lightBending && mu && dynamic.moon
      ? lightBendingAngleRad({
          r: dynamic.moon.r,
          observerDir,
          mu,
          c: rel.c,
          minImpact: rel.shapiroMinImpact,
        })
      : undefined;

  const closeEncounterDistance = currentCloseEncounterDistance(params, tObsSec);

  if ((rel.einsteinDelay || rel.lightBending) && validityFlags.indexOf("surrogate-model") === -1) {
    validityFlags.push("surrogate-model");
  }
  if (Number.isFinite(clockOffsetSec) && clockOffsetSec !== 0) validityFlags.push("clock-frame-mismatch");
  const minSeparation = params.dynamics?.collisionPolicy?.minSeparation;
  if (
    Number.isFinite(closeEncounterDistance) &&
    Number.isFinite(minSeparation) &&
    (closeEncounterDistance as number) < (minSeparation as number)
  ) {
    validityFlags.push("close-encounter");
  }

  const out: StepAdvancedTimingDiagnostics = {
    einsteinPlanetSec: Number.isFinite(einsteinPlanetSec) ? einsteinPlanetSec : undefined,
    einsteinMoonSec: Number.isFinite(einsteinMoonSec) ? einsteinMoonSec : undefined,
    barycentricClockOffsetSec:
      Number.isFinite(clockOffsetSec) && clockOffsetSec !== 0 ? clockOffsetSec : undefined,
    lightBendingPlanetRad: Number.isFinite(lightBendingPlanetRad) ? lightBendingPlanetRad : undefined,
    lightBendingMoonRad: Number.isFinite(lightBendingMoonRad) ? lightBendingMoonRad : undefined,
    closeEncounterDistance: Number.isFinite(closeEncounterDistance) ? closeEncounterDistance : undefined,
    validityFlags,
  };

  return Object.values(out).some((value) =>
    Array.isArray(value) ? value.length > 0 : typeof value === "number",
  )
    ? out
    : undefined;
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
  const fluxRefraction = additive.fluxRefractionOnly;

  const fluxStellarPreTransit = baselineFluxUsed * spotFluxFactor + fluxStellarVar;

  // Physically consistent composition: stellar term is attenuated, additive terms are not.
  // Assumption: Stellar variability is photospheric.
  const fluxTotal =
    fluxStellarPreTransit * fluxTransitFactor +
    (fluxPlanetPhase + fluxMoonPhase + fluxForwardScattering + fluxRingScattering + fluxRefraction);

  const exoDiag = computeExoDiagnostics(params, t, observerDir, kin);
  const observablesRaw = computeStepObservables(params, t, observerDir, kin);
  const dynamicTiming = computeTransitTimingDiagnostics(params, t, observerDir, kin);
  const clockOffsetSec = resolveObserverClockOffsetSec(params, t);
  const mergedTiming: StepTimingDiagnostics = {
    ...(observablesRaw?.timing ?? {}),
    ...(dynamicTiming.timing ?? {}),
  };
  const advancedTiming = computeAdvancedTimingDiagnostics(params, t, observerDir, kin, clockOffsetSec);
  if (advancedTiming?.einsteinPlanetSec !== undefined)
    mergedTiming.einsteinPlanetSec = advancedTiming.einsteinPlanetSec;
  if (advancedTiming?.einsteinMoonSec !== undefined)
    mergedTiming.einsteinMoonSec = advancedTiming.einsteinMoonSec;
  if (advancedTiming?.barycentricClockOffsetSec !== undefined) {
    mergedTiming.barycentricClockOffsetSec = advancedTiming.barycentricClockOffsetSec;
  }
  const timingWithClock = applyClockOffsetToTiming(mergedTiming, clockOffsetSec);
  const timing = Object.values(timingWithClock ?? {}).some((v) => typeof v === "number" && Number.isFinite(v))
    ? timingWithClock
    : undefined;
  const observables = observablesRaw
    ? {
        ...observablesRaw,
        timing,
      }
    : undefined;
  const conservation = observablesRaw?.conservation;

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
    fluxRefraction,
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
      advancedTiming,
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
        refraction: fluxRefraction,
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
