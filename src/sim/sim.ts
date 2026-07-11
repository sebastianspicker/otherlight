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
  BrightnessPatch,
  StepAdvancedTimingDiagnostics,
  StepResult,
  StepTimingDiagnostics,
  SystemParams,
} from "../core/types";
import { G_SI, toFiniteNumber } from "../core/units";
import type { Vec3 } from "../physics/vec3";
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

type ObserverDir = ReturnType<typeof getObserverDir>;
type BodyKinematicsState = ReturnType<typeof computeBodyKinematics>;
type OcculterSet = ReturnType<typeof buildOcculters>;
type AdditiveFluxComponents = ReturnType<typeof computeAdditiveFluxComponents>;
type StepObservablesResult = ReturnType<typeof computeStepObservables>;
type TransitTimingResult = ReturnType<typeof computeTransitTimingDiagnostics>;
type DynamicSystemState = ReturnType<typeof resolveDynamicSystemState>;
type RelativityConfig = ReturnType<typeof normalizeRelativityParams>;
type TimekeepingConfig = NonNullable<NonNullable<SystemParams["observer"]>["timekeeping"]>;
type NBodySample = NonNullable<ReturnType<typeof getNBodyStateAt>>;

type StepGeometry = {
  observerDir: ObserverDir;
  kin: BodyKinematicsState;
  occulters: OcculterSet;
};

type StepFluxTerms = {
  baselineFluxUsed: number;
  fluxTransitFactor: number;
  fluxStellarPreTransit: number;
  fluxTotal: number;
  fluxStellarVar: number;
  fluxPlanetPhase: number;
  fluxMoonPhase: number;
  fluxForwardScattering: number;
  fluxRingScattering: number;
  fluxRefraction: number;
  additive: AdditiveFluxComponents;
};

type StepTimingBundle = {
  exoDiag: ReturnType<typeof computeExoDiagnostics>;
  dynamicTiming: TransitTimingResult;
  advancedTiming: StepAdvancedTimingDiagnostics | undefined;
  observables: StepObservablesResult;
  timing: StepTimingDiagnostics | undefined;
  conservation: NonNullable<StepObservablesResult>["conservation"] | undefined;
};

type AdvancedTimingContext = {
  params: SystemParams;
  tObsSec: number;
  observerDir: ObserverDir;
  clockOffsetSec: number;
  rel: RelativityConfig;
  mu: number | undefined;
  dynamic: DynamicSystemState;
  closeEncounterDistance: number | undefined;
};

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

  return finiteClockOffset(clockConstantOffsetSec(tk) + periodicClockOffsetSec(tk, tObsSec));
}

function clockConstantOffsetSec(tk: TimekeepingConfig): number {
  return finiteConfigNumber(tk.barycentricOffsetSec, 0);
}

function periodicClockOffsetSec(tk: TimekeepingConfig, tObsSec: number): number {
  const amp = finiteConfigNumber(tk.periodicErrorAmpSec, 0);
  const periodSec = finiteConfigNumber(tk.periodSec, Number.NaN);
  if (!hasPeriodicClockOffset(amp, periodSec)) return 0;

  const phaseSec = finiteConfigNumber(tk.phaseSec, 0);
  return amp * Math.sin((2 * Math.PI * (tObsSec - phaseSec)) / periodSec);
}

function hasPeriodicClockOffset(amp: number, periodSec: number): boolean {
  return Number.isFinite(amp) && amp !== 0 && Number.isFinite(periodSec) && periodSec > 0;
}

function finiteConfigNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function finiteClockOffset(offsetSec: number): number {
  return Number.isFinite(offsetSec) ? offsetSec : 0;
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

  return closestFinitePairDistance(closeEncounterBodies(sample));
}

function closeEncounterBodies(sample: NBodySample): Vec3[] {
  return [sample.state.rS, sample.state.rP, sample.state.rM, ...closeEncounterPerturberBodies(sample)];
}

function closeEncounterPerturberBodies(sample: NBodySample): Vec3[] {
  return sample.state.perturbers?.map((perturber) => perturber.r) ?? [];
}

function closestFinitePairDistance(bodies: Vec3[]): number | undefined {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      best = smallerFiniteDistance(best, distanceBetween(bodies[i], bodies[j]));
    }
  }
  return Number.isFinite(best) ? best : undefined;
}

function distanceBetween(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function smallerFiniteDistance(current: number, candidate: number): number {
  return Number.isFinite(candidate) && candidate < current ? candidate : current;
}

function computeAdvancedTimingDiagnostics(
  params: SystemParams,
  tObsSec: number,
  observerDir: ObserverDir,
  kin: BodyKinematicsState,
  clockOffsetSec: number,
): StepAdvancedTimingDiagnostics | undefined {
  const context = advancedTimingContext(params, tObsSec, observerDir, kin, clockOffsetSec);
  const out = advancedTimingOutput(context);
  return hasAdvancedTimingOutput(out) ? out : undefined;
}

function advancedTimingContext(
  params: SystemParams,
  tObsSec: number,
  observerDir: ObserverDir,
  kin: BodyKinematicsState,
  clockOffsetSec: number,
): AdvancedTimingContext {
  const rel = normalizeRelativityParams(params.dynamics?.relativity);
  const mu = deriveCentralMu(params, tObsSec);
  const dynamic = resolveDynamicSystemState({ system: params, tObs: tObsSec, observerDir, kinAtT: kin });

  return {
    params,
    tObsSec,
    observerDir,
    clockOffsetSec,
    rel,
    mu,
    dynamic,
    closeEncounterDistance: currentCloseEncounterDistance(params, tObsSec),
  };
}

function advancedTimingOutput(context: AdvancedTimingContext): StepAdvancedTimingDiagnostics {
  const out: StepAdvancedTimingDiagnostics = {
    einsteinPlanetSec: einsteinDelayForBody(context, context.dynamic.planet),
    einsteinMoonSec: einsteinDelayForBody(context, context.dynamic.moon),
    barycentricClockOffsetSec: finiteNonZeroOrUndefined(context.clockOffsetSec),
    lightBendingPlanetRad: lightBendingForBody(context, context.dynamic.planet),
    lightBendingMoonRad: lightBendingForBody(context, context.dynamic.moon),
    closeEncounterDistance: finiteNumberOrUndefined(context.closeEncounterDistance),
    validityFlags: advancedValidityFlags(context),
  };

  return out;
}

function einsteinDelayForBody(
  context: AdvancedTimingContext,
  body: DynamicSystemState["planet"] | undefined,
): number | undefined {
  if (!context.rel.einsteinDelay || !context.mu || !body) return undefined;

  return finiteNumberOrUndefined(
    einsteinDelaySurrogateSec({
      r: body.r,
      v: body.v,
      mu: context.mu,
      c: context.rel.c,
      tObs: context.tObsSec,
      tRef: context.rel.timingRefSec,
    }),
  );
}

function lightBendingForBody(
  context: AdvancedTimingContext,
  body: DynamicSystemState["planet"] | undefined,
): number | undefined {
  if (!context.rel.lightBending || !context.mu || !body) return undefined;

  return finiteNumberOrUndefined(
    lightBendingAngleRad({
      r: body.r,
      observerDir: context.observerDir,
      mu: context.mu,
      c: context.rel.c,
      minImpact: context.rel.shapiroMinImpact,
    }),
  );
}

function advancedValidityFlags(context: AdvancedTimingContext): string[] {
  const flags: string[] = [];
  addFlagIf(flags, "surrogate-model", usesSurrogateTimingModel(context.rel));
  addFlagIf(flags, "clock-frame-mismatch", hasClockFrameMismatch(context.clockOffsetSec));
  addFlagIf(flags, "close-encounter", hasCloseEncounter(context));
  return flags;
}

function usesSurrogateTimingModel(rel: RelativityConfig): boolean {
  return rel.einsteinDelay || rel.lightBending;
}

function hasClockFrameMismatch(clockOffsetSec: number): boolean {
  return Number.isFinite(clockOffsetSec) && clockOffsetSec !== 0;
}

function hasCloseEncounter(context: AdvancedTimingContext): boolean {
  const minSeparation = context.params.dynamics?.collisionPolicy?.minSeparation;
  if (!Number.isFinite(context.closeEncounterDistance)) return false;
  if (!Number.isFinite(minSeparation)) return false;
  return (context.closeEncounterDistance as number) < (minSeparation as number);
}

function addFlagIf(flags: string[], flag: string, enabled: boolean): void {
  if (enabled && flags.indexOf(flag) === -1) flags.push(flag);
}

function finiteNumberOrUndefined(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? (value as number) : undefined;
}

function finiteNonZeroOrUndefined(value: number): number | undefined {
  return Number.isFinite(value) && value !== 0 ? value : undefined;
}

function hasAdvancedTimingOutput(out: StepAdvancedTimingDiagnostics): boolean {
  return Object.values(out).some(isAdvancedTimingValuePresent);
}

function isAdvancedTimingValuePresent(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : typeof value === "number";
}

function buildStepGeometry(params: SystemParams, t: number): StepGeometry {
  const observerDir = getObserverDir(params);
  assertTimeObserverContract({ system: params, tObs: t, observerDir });

  const kin = computeBodyKinematics(params, t, observerDir);
  return {
    observerDir,
    kin,
    occulters: buildOcculters(params, kin),
  };
}

function stepSpotPatches(
  params: SystemParams,
  t: number,
  observerDir: ObserverDir,
): BrightnessPatch[] | undefined {
  const phot = params.star.photometry;
  const evolvedPatches = evolvedSpotPatches(phot, t);
  if (!usesProjectedSurfacePatches(params, phot)) return evolvedPatches;

  return projectSurfacePatchesToSky({
    patches: evolvedPatches,
    t,
    tRef: phot?.spotEvolution?.tRef,
    observerDir,
    rStar: params.star.r,
    model: phot?.stellarSurface,
  });
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

function usesProjectedSurfacePatches(
  params: SystemParams,
  phot: SystemParams["star"]["photometry"],
): boolean {
  return (
    isPhysicsFeatureEnabled(params, "stellarSurface") &&
    Boolean(phot?.stellarSurface?.enabled && phot.stellarSurface.useSurfacePatches)
  );
}

function computeStepFluxTerms(params: SystemParams, t: number, geometry: StepGeometry): StepFluxTerms {
  const phot = params.star.photometry;
  const spotPatches = stepSpotPatches(params, t, geometry.observerDir);
  const fluxTransitFactor = computeTransitFlux(params, geometry.occulters, geometry.kin, {
    brightnessPatchesOverride: spotPatches,
  });
  const additive = computeAdditiveFluxComponents(params, t, geometry.observerDir, geometry.kin);

  const baselineFluxUsed = toFiniteNumber(phot?.baselineFlux, 1.0);
  const fluxStellarVar = additive.fluxStellarVarOnly;
  const fluxPlanetPhase = additive.fluxPlanetOnly;
  const fluxMoonPhase = additive.fluxMoonOnly;
  const fluxForwardScattering = additive.fluxForwardScatteringOnly;
  const fluxRingScattering = additive.fluxRingScatteringOnly;
  const fluxRefraction = additive.fluxRefractionOnly;
  // Patches are forwarded to the transit integrator; do not multiply them into the stellar baseline again.
  const fluxStellarPreTransit = baselineFluxUsed + fluxStellarVar;
  const fluxTotal = composedFluxTotal({
    fluxStellarPreTransit,
    fluxTransitFactor,
    fluxPlanetPhase,
    fluxMoonPhase,
    fluxForwardScattering,
    fluxRingScattering,
    fluxRefraction,
  });

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

function composedFluxTotal(terms: {
  fluxStellarPreTransit: number;
  fluxTransitFactor: number;
  fluxPlanetPhase: number;
  fluxMoonPhase: number;
  fluxForwardScattering: number;
  fluxRingScattering: number;
  fluxRefraction: number;
}): number {
  return (
    terms.fluxStellarPreTransit * terms.fluxTransitFactor +
    (terms.fluxPlanetPhase +
      terms.fluxMoonPhase +
      terms.fluxForwardScattering +
      terms.fluxRingScattering +
      terms.fluxRefraction)
  );
}

function computeStepTimingBundle(params: SystemParams, t: number, geometry: StepGeometry): StepTimingBundle {
  const exoDiag = computeExoDiagnostics(params, t, geometry.observerDir, geometry.kin);
  const observablesRaw = computeStepObservables(params, t, geometry.observerDir, geometry.kin);
  const dynamicTiming = computeTransitTimingDiagnostics(params, t, geometry.observerDir, geometry.kin);
  const clockOffsetSec = resolveObserverClockOffsetSec(params, t);
  const advancedTiming = computeAdvancedTimingDiagnostics(
    params,
    t,
    geometry.observerDir,
    geometry.kin,
    clockOffsetSec,
  );
  const timing = resolvedStepTiming(observablesRaw, dynamicTiming, advancedTiming, clockOffsetSec);

  return {
    exoDiag,
    dynamicTiming,
    advancedTiming,
    observables: observablesWithTiming(observablesRaw, timing),
    timing,
    conservation: observablesRaw?.conservation,
  };
}

function resolvedStepTiming(
  observablesRaw: StepObservablesResult,
  dynamicTiming: TransitTimingResult,
  advancedTiming: StepAdvancedTimingDiagnostics | undefined,
  clockOffsetSec: number,
): StepTimingDiagnostics | undefined {
  const mergedTiming = timingWithAdvanced(
    {
      ...(observablesRaw?.timing ?? {}),
      ...(dynamicTiming.timing ?? {}),
    },
    advancedTiming,
  );
  const timingWithClock = applyClockOffsetToTiming(mergedTiming, clockOffsetSec);
  return hasFiniteTimingNumber(timingWithClock) ? timingWithClock : undefined;
}

function timingWithAdvanced(
  timing: StepTimingDiagnostics,
  advancedTiming: StepAdvancedTimingDiagnostics | undefined,
): StepTimingDiagnostics {
  return {
    ...timing,
    ...advancedTimingFields(advancedTiming),
  };
}

function advancedTimingFields(
  advancedTiming: StepAdvancedTimingDiagnostics | undefined,
): Partial<StepTimingDiagnostics> {
  const fields: Partial<StepTimingDiagnostics> = {};
  if (advancedTiming?.einsteinPlanetSec !== undefined)
    fields.einsteinPlanetSec = advancedTiming.einsteinPlanetSec;
  if (advancedTiming?.einsteinMoonSec !== undefined) fields.einsteinMoonSec = advancedTiming.einsteinMoonSec;
  if (advancedTiming?.barycentricClockOffsetSec !== undefined) {
    fields.barycentricClockOffsetSec = advancedTiming.barycentricClockOffsetSec;
  }
  return fields;
}

function hasFiniteTimingNumber(timing: StepTimingDiagnostics | undefined): boolean {
  return Object.values(timing ?? {}).some((value) => typeof value === "number" && Number.isFinite(value));
}

function observablesWithTiming(
  observablesRaw: StepObservablesResult,
  timing: StepTimingDiagnostics | undefined,
): StepObservablesResult {
  if (!observablesRaw) return undefined;
  return {
    ...observablesRaw,
    timing,
  };
}

function buildStepResult(
  t: number,
  geometry: StepGeometry,
  flux: StepFluxTerms,
  timing: StepTimingBundle,
): StepResult {
  return {
    fluxTotal: toFiniteNumber(flux.fluxTotal, 1.0),
    fluxTransitFactor: flux.fluxTransitFactor,
    fluxStellarPreTransit: flux.fluxStellarPreTransit,
    fluxStellarVar: flux.fluxStellarVar,
    fluxPlanetPhase: flux.fluxPlanetPhase,
    fluxMoonPhase: flux.fluxMoonPhase,
    fluxForwardScattering: flux.fluxForwardScattering,
    fluxRingScattering: flux.fluxRingScattering,
    fluxRefraction: flux.fluxRefraction,
    planetSky: geometry.kin.planetSky,
    moonSky: geometry.kin.moonSky,
    meta: buildStepMeta(t, geometry, flux, timing),
  };
}

function buildStepMeta(
  t: number,
  geometry: StepGeometry,
  flux: StepFluxTerms,
  timing: StepTimingBundle,
): NonNullable<StepResult["meta"]> {
  return {
    t,
    nOcculters: geometry.occulters.length,
    planetVisibleFraction: flux.additive.planetVisibleFraction,
    moonVisibleFraction: flux.additive.moonVisibleFraction,
    stellarVariabilityFlux: flux.fluxStellarVar,
    forwardScatteringFlux: flux.fluxForwardScattering,
    ringScatteringFlux: flux.fluxRingScattering,
    baselineFluxUsed: flux.baselineFluxUsed,
    vPlanetSky: timing.exoDiag.vPlanetSky,
    vPlanetSkyRef: timing.exoDiag.vPlanetSkyRef,
    tdvRatio: timing.exoDiag.tdvRatio,
    bPlanet: timing.exoDiag.bPlanet,
    bMoon: timing.exoDiag.bMoon,
    observables: timing.observables,
    timing: timing.timing,
    advancedTiming: timing.advancedTiming,
    eventTimingConvergence: timing.dynamicTiming.eventTimingConvergence,
    timingConvergence: mapTimingSolveDiagnostics(geometry.kin.timingSolve),
    conservation: timing.conservation,
    fluxDecomposition: fluxDecomposition(flux),
  };
}

function fluxDecomposition(
  flux: StepFluxTerms,
): NonNullable<NonNullable<StepResult["meta"]>["fluxDecomposition"]> {
  return {
    stellarA: flux.baselineFluxUsed * flux.fluxTransitFactor,
    stellarB: 0,
    binaryEclipseTerms: flux.fluxTransitFactor,
    additivePlanetary: flux.fluxPlanetPhase + flux.fluxForwardScattering + flux.fluxRingScattering,
    additiveLunar: flux.fluxMoonPhase,
    instrumental: 0,
    stellarPreTransit: flux.fluxStellarPreTransit,
    stellarVariability: flux.fluxStellarVar,
    transitFactor: flux.fluxTransitFactor,
    planetPhase: flux.fluxPlanetPhase,
    moonPhase: flux.fluxMoonPhase,
    forwardScattering: flux.fluxForwardScattering,
    ringScattering: flux.fluxRingScattering,
    refraction: flux.fluxRefraction,
    total: toFiniteNumber(flux.fluxTotal, 1.0),
  };
}

function attachDidacticSignals(params: SystemParams, stepBase: StepResult): StepResult {
  const didacticsHook = getDidacticsHook();
  const didacticSignals = didacticsHook ? didacticsHook(params, stepBase) : undefined;
  return didacticSignals && stepBase.meta
    ? { ...stepBase, meta: { ...stepBase.meta, didacticSignals } }
    : stepBase;
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

  kickoffOptionalLimbDarkeningIfRequested(params);

  const geometry = buildStepGeometry(params, t);
  const flux = computeStepFluxTerms(params, t, geometry);
  const timing = computeStepTimingBundle(params, t, geometry);
  return attachDidacticSignals(params, buildStepResult(t, geometry, flux, timing));
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
