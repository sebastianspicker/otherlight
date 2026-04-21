import type { SystemParams } from "../core/types";
import type { PhysicsDiagnosticsV3, RenderSignalsV3, SimulationStepV3 } from "../sim/v3";

export const FIXED_PLOT_SAMPLE_COUNT = 256;
export const FIXED_PLOT_MIN_HALF_WINDOW_SEC = 6 * 3600;

export function finitePositive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function fallbackFlux(step?: SimulationStepV3): SimulationStepV3["flux"] {
  return {
    total: step?.flux.total ?? 1,
    transitFactor: step?.flux.transitFactor ?? 1,
    stellarPreTransit: step?.flux.stellarPreTransit ?? 1,
    stellarVariability: step?.flux.stellarVariability ?? 0,
    planetPhase: step?.flux.planetPhase ?? 0,
    moonPhase: step?.flux.moonPhase ?? 0,
    forwardScattering: step?.flux.forwardScattering ?? 0,
    ringScattering: step?.flux.ringScattering ?? 0,
    refraction: step?.flux.refraction ?? 0,
    decomposition: step?.flux.decomposition,
  };
}

function fallbackRenderSignals(
  params: SystemParams,
  step: SimulationStepV3 | undefined,
  kinematics: SimulationStepV3["kinematics"],
  flux: SimulationStepV3["flux"],
): RenderSignalsV3 {
  return {
    occulterGeometry: step?.renderSignals.occulterGeometry ?? [],
    eventMarkers: step?.renderSignals.eventMarkers ?? [],
    timingMarkers: step?.renderSignals.timingMarkers ?? [],
    visibilityFractions: step?.renderSignals.visibilityFractions ?? {},
    fluxComponents: {
      transitFactor: flux.transitFactor,
      stellarPreTransit: flux.stellarPreTransit,
      stellarVariability: flux.stellarVariability,
      planetPhase: flux.planetPhase,
      moonPhase: flux.moonPhase,
      forwardScattering: flux.forwardScattering,
      ringScattering: flux.ringScattering,
      refraction: flux.refraction ?? 0,
      total: flux.total,
    },
    orbitFrames: {
      observerDir: step?.renderSignals.orbitFrames.observerDir ?? params.observer?.dir,
      planetSky: step?.renderSignals.orbitFrames.planetSky ?? kinematics.planetSky,
      moonSky: step?.renderSignals.orbitFrames.moonSky ?? kinematics.moonSky,
    },
    uncertaintyFlags: [...(step?.renderSignals.uncertaintyFlags ?? []), "fallback-step-used"],
  };
}

function fallbackPhysicsDiagnostics(params: SystemParams, step?: SimulationStepV3): PhysicsDiagnosticsV3 {
  return {
    ltteConvergence: { enabled: false, status: "disabled" },
    shapiroConvergence: { enabled: false, status: "disabled" },
    integratorStats: {
      mode: params.dynamics?.nbodyPlanetMoon?.enabled ? "fixed-verlet" : "kepler",
      nbodyEnabled: Boolean(params.dynamics?.nbodyPlanetMoon?.enabled),
      dtMaxSec: params.dynamics?.nbodyPlanetMoon?.dtMax,
      softening: params.dynamics?.nbodyPlanetMoon?.softening,
    },
    closeEncounterFlags: [...(step?.physicsDiagnostics.closeEncounterFlags ?? [])],
    advancedTiming: step?.physicsDiagnostics.advancedTiming,
    energyDrift: step?.physicsDiagnostics.energyDrift,
    angularMomentumDrift: step?.physicsDiagnostics.angularMomentumDrift,
  };
}

export function fallbackStepV3(
  tObsSec: number,
  params: SystemParams,
  fallback?: SimulationStepV3,
): SimulationStepV3 {
  const kinematics: SimulationStepV3["kinematics"] = {
    planetSky: fallback?.kinematics.planetSky ?? { x: 0, y: 0, z: 0 },
    moonSky: fallback?.kinematics.moonSky,
  };
  const flux = fallbackFlux(fallback);
  return {
    tObsSec,
    kinematics,
    flux,
    timing: fallback?.timing,
    observables: fallback?.observables,
    conservation: fallback?.conservation,
    didactics: fallback?.didactics,
    debug: {
      nOcculters: fallback?.debug?.nOcculters,
      bPlanet: fallback?.debug?.bPlanet,
      bMoon: fallback?.debug?.bMoon,
      tdvRatio: fallback?.debug?.tdvRatio,
      vPlanetSky: fallback?.debug?.vPlanetSky,
      vPlanetSkyRef: fallback?.debug?.vPlanetSkyRef,
      baselineFluxUsed: fallback?.debug?.baselineFluxUsed ?? flux.stellarPreTransit,
      displayFluxValue: fallback?.debug?.displayFluxValue ?? flux.total,
      stellarVariabilityFlux: fallback?.debug?.stellarVariabilityFlux ?? flux.stellarVariability,
    },
    renderSignals: fallbackRenderSignals(params, fallback, kinematics, flux),
    physicsDiagnostics: fallbackPhysicsDiagnostics(params, fallback),
  };
}
