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

function computeConservation(
  snapshot: NativeSnapshot,
  baseline?: ConservationBaseline,
): {
  conservation?: StepConservationDiagnostics;
  physicsEnergyDrift?: number;
  physicsAngularMomentumDrift?: number;
  baseline: ConservationBaseline;
} {
  const dynBodies = snapshot.bodies.filter((b) => b.m > 0 && b.active);
  if (dynBodies.length < 2) return { baseline: baseline ?? {} };

  let kinetic = 0;
  let potential = 0;
  let l = { x: 0, y: 0, z: 0 };
  for (const b of dynBodies) {
    const v2 = vLenSq(b.vAbs);
    kinetic += 0.5 * b.m * v2;
    l = vAdd(l, {
      x: b.m * (b.rAbs.y * b.vAbs.z - b.rAbs.z * b.vAbs.y),
      y: b.m * (b.rAbs.z * b.vAbs.x - b.rAbs.x * b.vAbs.z),
      z: b.m * (b.rAbs.x * b.vAbs.y - b.rAbs.y * b.vAbs.x),
    });
  }
  for (let i = 0; i < dynBodies.length; i++) {
    for (let j = i + 1; j < dynBodies.length; j++) {
      const rij = Math.sqrt(vLenSq(vSub(dynBodies[i].rAbs, dynBodies[j].rAbs)));
      if (rij > 0) potential += (-G_SI * dynBodies[i].m * dynBodies[j].m) / rij;
    }
  }
  const energy = kinetic + potential;
  const angularMomentum = Math.sqrt(vLenSq(l));

  const nextBaseline: ConservationBaseline = baseline ?? { energy, angularMomentum };
  const conservation: StepConservationDiagnostics = {
    energy,
    angularMomentum,
  };
  const eBase = nextBaseline.energy;
  const lBase = nextBaseline.angularMomentum;
  const physicsEnergyDrift =
    Number.isFinite(eBase) && eBase !== 0 ? (energy - eBase!) / Math.abs(eBase!) : undefined;
  const physicsAngularMomentumDrift =
    Number.isFinite(lBase) && lBase !== 0 ? (angularMomentum - lBase!) / Math.abs(lBase!) : undefined;
  return { conservation, physicsEnergyDrift, physicsAngularMomentumDrift, baseline: nextBaseline };
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

function renderSignalsFromSnapshot(
  snap: NativeSnapshot,
  flux: FluxBundle,
  timing: StepTimingDiagnostics | undefined,
): RenderSignalsV3 {
  const starRef = snap.stars[0];
  const relSky = (body: NativeBodyState | undefined) => {
    if (!body || !starRef) return undefined;
    return {
      x: body.sky.x - starRef.sky.x,
      y: body.sky.y - starRef.sky.y,
      z: body.sky.z - starRef.sky.z,
    };
  };
  const visualPlanet = snap.planets[0] ?? snap.stars[1];
  const visualMoon = snap.moons[0];
  const occulterGeometry: RenderSignalsV3["occulterGeometry"] = [];
  const visualPlanetSky = relSky(visualPlanet);
  if (visualPlanet && visualPlanet.r > 0 && visualPlanetSky) {
    occulterGeometry.push({
      body: visualPlanet.kind === "star" ? "star" : "planet",
      kind: "circle",
      center: visualPlanetSky,
      radius: visualPlanet.r,
    });
  }
  const visualMoonSky = relSky(visualMoon);
  if (visualMoon && visualMoon.r > 0 && visualMoonSky) {
    occulterGeometry.push({
      body: "moon",
      kind: "circle",
      center: visualMoonSky,
      radius: visualMoon.r,
    });
  }
  const transitActive = flux.transitFactor < 0.999999;
  const mutual = (flux.planetVisibleFraction ?? 1) < 0.999999 || (flux.moonVisibleFraction ?? 1) < 0.999999;

  const timingMarkers: RenderSignalsV3["timingMarkers"] = [];
  if (timing) {
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
  }

  return {
    occulterGeometry,
    eventMarkers: [
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
    ],
    timingMarkers,
    visibilityFractions: {
      planet: flux.planetVisibleFraction,
      moon: flux.moonVisibleFraction,
    },
    fluxComponents: {
      transitFactor: flux.transitFactor,
      stellarPreTransit: flux.stellarPreTransit,
      stellarVariability: flux.stellarVariability,
      planetPhase: flux.additivePlanetary,
      moonPhase: flux.additiveLunar,
      forwardScattering: flux.forwardScattering,
      ringScattering: flux.ringScattering,
      refraction: flux.refraction,
      total: flux.total,
    },
    orbitFrames: {
      observerDir: snap.observerDir,
      planetSky: visualPlanetSky ?? { x: 0, y: 0, z: 0 },
      moonSky: visualMoonSky,
    },
    uncertaintyFlags: [],
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
  const snap = buildNativeSnapshot(
    {
      ...config,
      runtime: {
        ...(config.runtime ?? {}),
        executionMode: args.executionMode ?? config.runtime?.executionMode,
      },
    },
    tObsSec,
  );
  const flux = computeFluxBundle(config, snap, tObsSec);
  const diag = computeTimingAndObservables(config, snap, tObsSec);
  const conservation = computeConservation(snap, args.conservationBaseline);
  const didactics = buildDidacticSignals(config, tObsSec, flux, diag);
  const renderSignals = renderSignalsFromSnapshot(snap, flux, diag.timing);

  const planet = snap.planets[0] ?? snap.stars[1];
  const moon = snap.moons[0];
  const decomposition: StepFluxDecomposition = {
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

  const physicsDiagnostics: PhysicsDiagnosticsV3 = {
    ltteConvergence: {
      enabled: Boolean(config.dynamics?.relativity?.enabled && config.dynamics?.relativity?.ltte !== false),
      status:
        config.dynamics?.relativity?.enabled && config.dynamics?.relativity?.ltte !== false
          ? "unavailable"
          : "disabled",
      validityFlags:
        config.dynamics?.relativity?.enabled && config.dynamics?.relativity?.ltte !== false
          ? ["solver-not-run-native-path"]
          : undefined,
    },
    shapiroConvergence: {
      enabled: Boolean(
        config.dynamics?.relativity?.enabled && config.dynamics?.relativity?.shapiro !== false,
      ),
      status:
        config.dynamics?.relativity?.enabled && config.dynamics?.relativity?.shapiro !== false
          ? "unavailable"
          : "disabled",
      validityFlags:
        config.dynamics?.relativity?.enabled && config.dynamics?.relativity?.shapiro !== false
          ? ["solver-not-run-native-path"]
          : undefined,
    },
    integratorStats: {
      mode: mode === "reference" ? "adaptive-verlet" : "fixed-verlet",
      nbodyEnabled: Boolean(config.dynamics?.nbodyPlanetMoon?.enabled),
    },
    energyDrift: conservation.physicsEnergyDrift,
    angularMomentumDrift: conservation.physicsAngularMomentumDrift,
    closeEncounterFlags: [],
  };

  const step: SimulationStepV3 = {
    tObsSec,
    kinematics: {
      planetSky: planet?.sky ?? { x: 0, y: 0, z: 0 },
      moonSky: moon?.sky,
    },
    flux: {
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
    },
    timing: diag.timing,
    observables: diag.observables,
    conservation: conservation.conservation,
    renderSignals,
    physicsDiagnostics,
    didactics,
    debug: {
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
    },
  };

  return {
    step,
    conservationBaseline: conservation.baseline,
  };
}
