import type {
  SystemParams,
  StepConservationDiagnostics,
  StepFluxDecomposition,
  StepTimingDiagnostics,
} from "../../core/types";
import type {
  PhysicsDiagnosticsV3,
  RenderSignalsV3,
  SimulationDidacticsV3,
  SimulationStepV3,
} from "../v3/types";
import { G_SI } from "../../core/units";
import { getDidacticsHook } from "../didacticsHook";
import { vAdd, vLenSq, vSub } from "../../physics/vec3";
import type { RuntimeExecutionModeV4, RuntimeModeV4, SimulationConfigV4 } from "./types";
import {
  buildNativeSnapshot,
  computeFluxBundle,
  type ConservationBaseline,
  type FluxBundle,
  type NativeBodyState,
  type NativeSnapshot,
} from "./nativeModel";
import {
  detachedBinaryBaselineFlux as resolveDetachedBinaryBaselineFlux,
  displayFluxValueForConfig,
} from "./binaryBaseline";
import { computeTimingAndObservables } from "./nativeEngineTiming";

/** Flux threshold below 1 that marks an active transit or mutual event (planet or moon occults star). */
const TRANSIT_FLUX_THRESHOLD = 0.999999;

type ConservationResult = {
  conservation?: StepConservationDiagnostics;
  physicsEnergyDrift?: number;
  physicsAngularMomentumDrift?: number;
  baseline: ConservationBaseline;
};

type RelativeSky = { x: number; y: number; z: number };

type VisualBodies = {
  planet?: NativeBodyState;
  moon?: NativeBodyState;
  planetSky?: RelativeSky;
  moonSky?: RelativeSky;
};

type NativeTimingDiagnostics = ReturnType<typeof computeTimingAndObservables>;

function dynamicBodies(snapshot: NativeSnapshot): NativeBodyState[] {
  return snapshot.bodies.filter((body) => body.m > 0 && body.active);
}

function kineticEnergyAndAngularMomentum(bodies: NativeBodyState[]): {
  kinetic: number;
  angularMomentum: number;
} {
  let kinetic = 0;
  let l = { x: 0, y: 0, z: 0 };
  for (const b of bodies) {
    kinetic += 0.5 * b.m * vLenSq(b.vAbs);
    l = vAdd(l, {
      x: b.m * (b.rAbs.y * b.vAbs.z - b.rAbs.z * b.vAbs.y),
      y: b.m * (b.rAbs.z * b.vAbs.x - b.rAbs.x * b.vAbs.z),
      z: b.m * (b.rAbs.x * b.vAbs.y - b.rAbs.y * b.vAbs.x),
    });
  }
  return { kinetic, angularMomentum: Math.sqrt(vLenSq(l)) };
}

function pairPotentialEnergy(a: NativeBodyState, b: NativeBodyState): number {
  const rij = Math.sqrt(vLenSq(vSub(a.rAbs, b.rAbs)));
  return rij > 0 ? (-G_SI * a.m * b.m) / rij : 0;
}

function potentialEnergy(bodies: NativeBodyState[]): number {
  let potential = 0;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      potential += pairPotentialEnergy(bodies[i], bodies[j]);
    }
  }
  return potential;
}

function relativeDrift(value: number, baseline: number | undefined): number | undefined {
  return Number.isFinite(baseline) && baseline !== 0 ? (value - baseline!) / Math.abs(baseline!) : undefined;
}

function computeConservation(snapshot: NativeSnapshot, baseline?: ConservationBaseline): ConservationResult {
  const dynBodies = dynamicBodies(snapshot);
  if (dynBodies.length < 2) return { baseline: baseline ?? {} };

  const motion = kineticEnergyAndAngularMomentum(dynBodies);
  const energy = motion.kinetic + potentialEnergy(dynBodies);
  const angularMomentum = motion.angularMomentum;

  const nextBaseline: ConservationBaseline = baseline ?? { energy, angularMomentum };
  return {
    conservation: { energy, angularMomentum },
    physicsEnergyDrift: relativeDrift(energy, nextBaseline.energy),
    physicsAngularMomentumDrift: relativeDrift(angularMomentum, nextBaseline.angularMomentum),
    baseline: nextBaseline,
  };
}

function buildDidacticSignals(
  config: SimulationConfigV4,
  tObsSec: number,
  flux: FluxBundle,
  diag: ReturnType<typeof computeTimingAndObservables>,
): SimulationDidacticsV3 | undefined {
  if (!config.didactics?.enabled) return undefined;
  const star = config.bodies.stars[0];
  const binaryOccultor = config.bodies.stars[1];
  const planet =
    config.bodies.planets[0] ??
    (binaryOccultor
      ? {
          r: binaryOccultor.r,
          m: binaryOccultor.m,
          orbit: config.orbits.binary,
        }
      : undefined);
  if (!planet) return { signals: undefined };
  const pseudo: SystemParams = {
    observer: config.observer,
    star: { r: star.r, m: star.m, photometry: config.photometry },
    planet: { r: planet.r, m: planet.m, orbit: planet.orbit },
    moon: config.bodies.moons[0]
      ? {
          r: config.bodies.moons[0].r,
          m: config.bodies.moons[0].m,
          orbitAroundPlanet: config.bodies.moons[0].orbit,
        }
      : undefined,
    dynamics: config.dynamics,
    didactics: config.didactics,
  };
  const didacticsHook = getDidacticsHook();
  const signals = didacticsHook
    ? didacticsHook(pseudo, {
        fluxTotal: flux.total,
        fluxTransitFactor: flux.transitFactor,
        planetSky: diag.relPlanetSky,
        moonSky: diag.relMoonSky,
        meta: {
          t: tObsSec,
          bPlanet: diag.bPlanet,
          bMoon: diag.bMoon,
          tdvRatio: diag.tdvRatio,
          observables: diag.observables,
          baselineFluxUsed: detachedBinaryBaselineFlux(config, flux),
          displayFluxValue: displayFluxValueForConfig(config, flux.total),
        },
      })
    : undefined;
  return {
    signals,
    learningProgress: config.didactics.learningState,
  };
}

function detachedBinaryBaselineFlux(config: SimulationConfigV4, flux: FluxBundle): number {
  if (config.mode !== "detached-binary-lab") {
    return Math.max(0, flux.stellarPreTransit - flux.stellarVariability);
  }
  return resolveDetachedBinaryBaselineFlux(config) as number;
}

function relativeSky(
  body: NativeBodyState | undefined,
  starRef: NativeBodyState | undefined,
): RelativeSky | undefined {
  if (!body || !starRef) return undefined;
  return {
    x: body.sky.x - starRef.sky.x,
    y: body.sky.y - starRef.sky.y,
    z: body.sky.z - starRef.sky.z,
  };
}

function visualBodiesFromSnapshot(snap: NativeSnapshot): VisualBodies {
  const starRef = snap.stars[0];
  const planet = snap.planets[0] ?? snap.stars[1];
  const moon = snap.moons[0];
  return {
    planet,
    moon,
    planetSky: relativeSky(planet, starRef),
    moonSky: relativeSky(moon, starRef),
  };
}

function appendCircleOcculter(
  out: RenderSignalsV3["occulterGeometry"],
  body: NativeBodyState | undefined,
  center: RelativeSky | undefined,
  label: "star" | "planet" | "moon",
): void {
  if (!body || !(body.r > 0) || !center) return;
  out.push({
    body: label,
    kind: "circle",
    center,
    radius: body.r,
  });
}

function occulterGeometryFromVisualBodies(visual: VisualBodies): RenderSignalsV3["occulterGeometry"] {
  const occulterGeometry: RenderSignalsV3["occulterGeometry"] = [];
  const planetLabel = visual.planet?.kind === "star" ? "star" : "planet";
  appendCircleOcculter(occulterGeometry, visual.planet, visual.planetSky, planetLabel);
  appendCircleOcculter(occulterGeometry, visual.moon, visual.moonSky, "moon");
  return occulterGeometry;
}

function timingMarkersFromDiagnostics(
  timing: StepTimingDiagnostics | undefined,
): RenderSignalsV3["timingMarkers"] {
  const timingMarkers: RenderSignalsV3["timingMarkers"] = [];
  if (!timing) return timingMarkers;

  const items: Array<[string, number | undefined]> = [
    ["planetTransitCenterSec", timing.planetTransitCenterSec],
    ["planetTransitDurationSec", timing.planetTransitDurationSec],
    ["planetTtvSec", timing.planetTtvSec],
    ["moonTransitCenterSec", timing.moonTransitCenterSec],
    ["moonTransitDurationSec", timing.moonTransitDurationSec],
    ["moonTtvSec", timing.moonTtvSec],
  ];
  for (const [id, seconds] of items) {
    if (Number.isFinite(seconds)) timingMarkers.push({ id, seconds });
  }
  return timingMarkers;
}

function eventMarkersFromState(
  flux: FluxBundle,
  timingMarkers: RenderSignalsV3["timingMarkers"],
): RenderSignalsV3["eventMarkers"] {
  const transitActive = flux.transitFactor < TRANSIT_FLUX_THRESHOLD;
  const mutual =
    (flux.planetVisibleFraction ?? 1) < TRANSIT_FLUX_THRESHOLD ||
    (flux.moonVisibleFraction ?? 1) < TRANSIT_FLUX_THRESHOLD;

  return [
    { id: "transit", kind: "transit", label: "Transit attenuation active", active: transitActive },
    { id: "mutual", kind: "mutual-event", label: "Mutual event active", active: mutual },
    {
      id: "timing-correction",
      kind: "timing",
      label: "Timing diagnostics available",
      active: timingMarkers.length > 0,
    },
    {
      id: "conjunction",
      kind: "conjunction",
      label: "Conjunction",
      active: false,
    },
  ];
}

function fluxComponentsFromBundle(flux: FluxBundle): RenderSignalsV3["fluxComponents"] {
  return {
    transitFactor: flux.transitFactor,
    stellarPreTransit: flux.stellarPreTransit,
    stellarVariability: flux.stellarVariability,
    planetPhase: flux.additivePlanetary,
    moonPhase: flux.additiveLunar,
    forwardScattering: flux.forwardScattering,
    ringScattering: flux.ringScattering,
    refraction: flux.refraction,
    total: flux.total,
  };
}

function renderSignalsFromSnapshot(
  snap: NativeSnapshot,
  flux: FluxBundle,
  timing: StepTimingDiagnostics | undefined,
): RenderSignalsV3 {
  const visual = visualBodiesFromSnapshot(snap);
  const timingMarkers = timingMarkersFromDiagnostics(timing);

  return {
    occulterGeometry: occulterGeometryFromVisualBodies(visual),
    eventMarkers: eventMarkersFromState(flux, timingMarkers),
    timingMarkers,
    visibilityFractions: {
      planet: flux.planetVisibleFraction,
      moon: flux.moonVisibleFraction,
    },
    fluxComponents: fluxComponentsFromBundle(flux),
    orbitFrames: {
      observerDir: snap.observerDir,
      planetSky: visual.planetSky ?? { x: 0, y: 0, z: 0 },
      moonSky: visual.moonSky,
    },
    uncertaintyFlags: [],
  };
}

function runtimeConfigForStep(
  config: SimulationConfigV4,
  executionMode: RuntimeExecutionModeV4 | undefined,
): SimulationConfigV4 {
  return {
    ...config,
    runtime: {
      ...(config.runtime ?? {}),
      executionMode: executionMode ?? config.runtime?.executionMode,
    },
  };
}

function fluxDecompositionFromBundle(flux: FluxBundle): StepFluxDecomposition {
  return {
    stellarA: flux.stellarA,
    stellarB: flux.stellarB,
    binaryEclipseTerms: flux.binaryEclipseFactor,
    additivePlanetary: flux.additivePlanetary + flux.forwardScattering + flux.ringScattering,
    additiveLunar: flux.additiveLunar,
    instrumental: 0,
    stellarPreTransit: flux.stellarPreTransit,
    stellarVariability: flux.stellarVariability,
    transitFactor: flux.transitFactor,
    planetPhase: flux.additivePlanetary,
    moonPhase: flux.additiveLunar,
    forwardScattering: flux.forwardScattering,
    ringScattering: flux.ringScattering,
    refraction: flux.refraction,
    total: flux.total,
  };
}

function nativeRelativitySolverStatus(enabled: boolean): PhysicsDiagnosticsV3["ltteConvergence"] {
  return {
    enabled,
    status: enabled ? "unavailable" : "disabled",
    validityFlags: enabled ? ["solver-not-run-native-path"] : undefined,
  };
}

function physicsDiagnosticsFromStep(
  config: SimulationConfigV4,
  mode: RuntimeModeV4,
  conservation: ConservationResult,
): PhysicsDiagnosticsV3 {
  const ltteEnabled = Boolean(
    config.dynamics?.relativity?.enabled && config.dynamics?.relativity?.ltte !== false,
  );
  const shapiroEnabled = Boolean(
    config.dynamics?.relativity?.enabled && config.dynamics?.relativity?.shapiro !== false,
  );

  return {
    ltteConvergence: nativeRelativitySolverStatus(ltteEnabled),
    shapiroConvergence: nativeRelativitySolverStatus(shapiroEnabled),
    integratorStats: {
      mode: mode === "reference" ? "adaptive-verlet" : "fixed-verlet",
      nbodyEnabled: Boolean(config.dynamics?.nbodyPlanetMoon?.enabled),
    },
    energyDrift: conservation.physicsEnergyDrift,
    angularMomentumDrift: conservation.physicsAngularMomentumDrift,
    closeEncounterFlags: [],
  };
}

function kinematicsFromSnapshot(snap: NativeSnapshot): SimulationStepV3["kinematics"] {
  const planet = snap.planets[0] ?? snap.stars[1];
  return {
    planetSky: planet?.sky ?? { x: 0, y: 0, z: 0 },
    moonSky: snap.moons[0]?.sky,
  };
}

function fluxResultFromBundle(
  flux: FluxBundle,
  decomposition: StepFluxDecomposition,
): SimulationStepV3["flux"] {
  return {
    total: flux.total,
    transitFactor: flux.transitFactor,
    stellarPreTransit: flux.stellarPreTransit,
    stellarVariability: flux.stellarVariability,
    planetPhase: flux.additivePlanetary,
    moonPhase: flux.additiveLunar,
    forwardScattering: flux.forwardScattering,
    ringScattering: flux.ringScattering,
    refraction: flux.refraction,
    decomposition,
  };
}

function debugFromStepInputs(
  config: SimulationConfigV4,
  flux: FluxBundle,
  diag: NativeTimingDiagnostics,
): SimulationStepV3["debug"] {
  return {
    nOcculters: flux.nOcculters,
    bPlanet: diag.bPlanet,
    bMoon: diag.bMoon,
    tdvRatio: diag.tdvRatio,
    vPlanetSky: diag.vPlanetSky,
    vPlanetSkyRef: diag.vPlanetSkyRef,
    baselineFluxUsed: detachedBinaryBaselineFlux(config, flux),
    displayFluxValue: displayFluxValueForConfig(config, flux.total),
    stellarVariabilityFlux: flux.stellarVariability,
    eventTimingSolvePlanet: diag.eventTimingConvergence?.planet,
    eventTimingSolveMoon: diag.eventTimingConvergence?.moon,
  };
}

function buildNativeSimulationStep(args: {
  config: SimulationConfigV4;
  tObsSec: number;
  mode: RuntimeModeV4;
  snap: NativeSnapshot;
  flux: FluxBundle;
  diag: NativeTimingDiagnostics;
  conservation: ConservationResult;
  didactics: SimulationDidacticsV3 | undefined;
  renderSignals: RenderSignalsV3;
}): SimulationStepV3 {
  const { config, tObsSec, mode, snap, flux, diag, conservation, didactics, renderSignals } = args;
  const decomposition = fluxDecompositionFromBundle(flux);

  return {
    tObsSec,
    kinematics: kinematicsFromSnapshot(snap),
    flux: fluxResultFromBundle(flux, decomposition),
    timing: diag.timing,
    observables: diag.observables,
    conservation: conservation.conservation,
    renderSignals,
    physicsDiagnostics: physicsDiagnosticsFromStep(config, mode, conservation),
    didactics,
    debug: debugFromStepInputs(config, flux, diag),
  };
}

export function stepNativeSimulationV4(args: {
  config: SimulationConfigV4;
  tObsSec: number;
  mode: RuntimeModeV4;
  executionMode?: RuntimeExecutionModeV4;
  conservationBaseline?: ConservationBaseline;
}): {
  step: SimulationStepV3;
  conservationBaseline: ConservationBaseline;
} {
  const { config, tObsSec, mode } = args;
  const snap = buildNativeSnapshot(runtimeConfigForStep(config, args.executionMode), tObsSec);
  const flux = computeFluxBundle(config, snap, tObsSec);
  const diag = computeTimingAndObservables(config, snap, tObsSec);
  const conservation = computeConservation(snap, args.conservationBaseline);
  const didactics = buildDidacticSignals(config, tObsSec, flux, diag);
  const renderSignals = renderSignalsFromSnapshot(snap, flux, diag.timing);

  return {
    step: buildNativeSimulationStep({
      config,
      tObsSec,
      mode,
      snap,
      flux,
      diag,
      conservation,
      didactics,
      renderSignals,
    }),
    conservationBaseline: conservation.baseline,
  };
}
