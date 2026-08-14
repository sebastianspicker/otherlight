/** Composes stable step results, metadata, flux decomposition, and didactic signals. */
import type { StepResult, SystemParams } from "../core/types";
import { toFiniteNumber } from "../core/units";
import { getDidacticsHook } from "./didacticsHook";
import { mapTimingSolveDiagnostics } from "./simTiming";
import type { StepFluxTerms, StepGeometry, StepTimingBundle } from "./simTypes";

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

export function buildStepResult(
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

export function attachDidacticSignals(params: SystemParams, stepBase: StepResult): StepResult {
  const didacticsHook = getDidacticsHook();
  const didacticSignals = didacticsHook ? didacticsHook(params, stepBase) : undefined;
  return didacticSignals && stepBase.meta
    ? { ...stepBase, meta: { ...stepBase.meta, didacticSignals } }
    : stepBase;
}
