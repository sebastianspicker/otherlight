/**
 * Owns frame Loop Fallback support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { SystemParams } from "../core/types";
import type { PhysicsDiagnosticsV3, RenderSignalsV3, SimulationStepV3 } from "../sim/v3";

export const FIXED_PLOT_SAMPLE_COUNT = 256;
export const FIXED_PLOT_MIN_HALF_WINDOW_SEC = 6 * 3600;

export function finitePositive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

type FallbackFlux = SimulationStepV3["flux"];
type FallbackKinematics = SimulationStepV3["kinematics"];
type FallbackDebug = NonNullable<SimulationStepV3["debug"]>;

function defaultPlanetSky(): FallbackKinematics["planetSky"] {
  return { x: 0, y: 0, z: 0 };
}

function fallbackCoreFlux(
  flux: FallbackFlux | undefined,
): Pick<FallbackFlux, "total" | "transitFactor" | "stellarPreTransit"> {
  return {
    total: flux?.total ?? 1,
    transitFactor: flux?.transitFactor ?? 1,
    stellarPreTransit: flux?.stellarPreTransit ?? 1,
  };
}

function fallbackPhaseFlux(
  flux: FallbackFlux | undefined,
): Pick<FallbackFlux, "stellarVariability" | "planetPhase" | "moonPhase"> {
  return {
    stellarVariability: flux?.stellarVariability ?? 0,
    planetPhase: flux?.planetPhase ?? 0,
    moonPhase: flux?.moonPhase ?? 0,
  };
}

function fallbackScatteringFlux(
  flux: FallbackFlux | undefined,
): Pick<FallbackFlux, "forwardScattering" | "ringScattering" | "refraction"> {
  return {
    forwardScattering: flux?.forwardScattering ?? 0,
    ringScattering: flux?.ringScattering ?? 0,
    refraction: flux?.refraction ?? 0,
  };
}

function fallbackFlux(step?: SimulationStepV3): SimulationStepV3["flux"] {
  const flux = step?.flux;
  return {
    ...fallbackCoreFlux(flux),
    ...fallbackPhaseFlux(flux),
    ...fallbackScatteringFlux(flux),
    decomposition: flux?.decomposition,
  };
}

function fallbackRenderCollections(
  signals: RenderSignalsV3 | undefined,
): Pick<RenderSignalsV3, "occulterGeometry" | "eventMarkers"> {
  return {
    occulterGeometry: signals?.occulterGeometry ?? [],
    eventMarkers: signals?.eventMarkers ?? [],
  };
}

function fallbackTimingCollections(
  signals: RenderSignalsV3 | undefined,
): Pick<RenderSignalsV3, "timingMarkers" | "visibilityFractions"> {
  return {
    timingMarkers: signals?.timingMarkers ?? [],
    visibilityFractions: signals?.visibilityFractions ?? {},
  };
}

function fallbackFluxComponents(flux: FallbackFlux): RenderSignalsV3["fluxComponents"] {
  return {
    transitFactor: flux.transitFactor,
    stellarPreTransit: flux.stellarPreTransit,
    stellarVariability: flux.stellarVariability,
    planetPhase: flux.planetPhase,
    moonPhase: flux.moonPhase,
    forwardScattering: flux.forwardScattering,
    ringScattering: flux.ringScattering,
    refraction: flux.refraction ?? 0,
    total: flux.total,
  };
}

function fallbackOrbitFrames(
  params: SystemParams,
  signals: RenderSignalsV3 | undefined,
  kinematics: FallbackKinematics,
): RenderSignalsV3["orbitFrames"] {
  return {
    observerDir: signals?.orbitFrames.observerDir ?? params.observer?.dir,
    planetSky: signals?.orbitFrames.planetSky ?? kinematics.planetSky,
    moonSky: signals?.orbitFrames.moonSky ?? kinematics.moonSky,
  };
}

function fallbackUncertaintyFlags(signals: RenderSignalsV3 | undefined): string[] {
  return [...(signals?.uncertaintyFlags ?? []), "fallback-step-used"];
}

function fallbackRenderSignals(
  params: SystemParams,
  step: SimulationStepV3 | undefined,
  kinematics: SimulationStepV3["kinematics"],
  flux: SimulationStepV3["flux"],
): RenderSignalsV3 {
  const signals = step?.renderSignals;
  return {
    ...fallbackRenderCollections(signals),
    ...fallbackTimingCollections(signals),
    fluxComponents: fallbackFluxComponents(flux),
    orbitFrames: fallbackOrbitFrames(params, signals, kinematics),
    uncertaintyFlags: fallbackUncertaintyFlags(signals),
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

function fallbackKinematics(fallback: SimulationStepV3 | undefined): FallbackKinematics {
  return {
    planetSky: fallback?.kinematics.planetSky ?? defaultPlanetSky(),
    moonSky: fallback?.kinematics.moonSky,
  };
}

function fallbackDebugGeometry(
  debug: FallbackDebug | undefined,
): Pick<FallbackDebug, "nOcculters" | "bPlanet" | "bMoon" | "tdvRatio"> {
  return {
    nOcculters: debug?.nOcculters,
    bPlanet: debug?.bPlanet,
    bMoon: debug?.bMoon,
    tdvRatio: debug?.tdvRatio,
  };
}

function fallbackDebugVelocities(
  debug: FallbackDebug | undefined,
): Pick<FallbackDebug, "vPlanetSky" | "vPlanetSkyRef"> {
  return {
    vPlanetSky: debug?.vPlanetSky,
    vPlanetSkyRef: debug?.vPlanetSkyRef,
  };
}

function fallbackDebugFluxes(
  debug: FallbackDebug | undefined,
  flux: FallbackFlux,
): Pick<FallbackDebug, "baselineFluxUsed" | "displayFluxValue" | "stellarVariabilityFlux"> {
  return {
    baselineFluxUsed: debug?.baselineFluxUsed ?? flux.stellarPreTransit,
    displayFluxValue: debug?.displayFluxValue ?? flux.total,
    stellarVariabilityFlux: debug?.stellarVariabilityFlux ?? flux.stellarVariability,
  };
}

function fallbackDebug(fallback: SimulationStepV3 | undefined, flux: FallbackFlux): FallbackDebug {
  const debug = fallback?.debug;
  return {
    ...fallbackDebugGeometry(debug),
    ...fallbackDebugVelocities(debug),
    ...fallbackDebugFluxes(debug, flux),
  };
}

export function fallbackStepV3(
  tObsSec: number,
  params: SystemParams,
  fallback?: SimulationStepV3,
): SimulationStepV3 {
  const kinematics = fallbackKinematics(fallback);
  const flux = fallbackFlux(fallback);
  return {
    tObsSec,
    kinematics,
    flux,
    timing: undefined,
    observables: undefined,
    conservation: undefined,
    didactics: undefined,
    debug: fallbackDebug(fallback, flux),
    renderSignals: fallbackRenderSignals(params, fallback, kinematics, flux),
    physicsDiagnostics: fallbackPhysicsDiagnostics(params, fallback),
  };
}
