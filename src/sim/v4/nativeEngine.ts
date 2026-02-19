import type {
  SystemParams,
  StepConservationDiagnostics,
  StepFluxDecomposition,
  StepObservables,
  StepTimingDiagnostics,
} from "../../core/types";
import type {
  PhysicsDiagnosticsV3,
  RenderSignalsV3,
  SimulationDidacticsV3,
  SimulationStepV3,
} from "../v3/types";
import { G_SI } from "../../core/units";
import { computeDidacticSignals } from "../../didactics/engine";
import { projectToSky } from "../../physics/frames";
import type { Vec3 } from "../../physics/vec3";
import { vAdd, vIsFinite, vLenSq, vNormalizeOrZero, vSub } from "../../physics/vec3";
import type { MoonBodyV4, PlanetBodyV4, RuntimeModeV4, SimulationConfigV4 } from "./types";
import {
  buildNativeSnapshot,
  computeFluxBundle,
  finiteOrDefault,
  orbitStateAt,
  type ConservationBaseline,
  type FluxBundle,
  type NativeSnapshot,
} from "./nativeModel";

function estimateTransitEvent(args: {
  tObsSec: number;
  rStar: number;
  rBody: number;
  sky: { x: number; y: number; z: number };
  vSky: { x: number; y: number; z: number };
  periodSec?: number;
  t0Sec?: number;
}): {
  centerSec: number;
  durationSec: number;
  ingressSec: number;
  egressSec: number;
  ttvSec?: number;
} | null {
  const { tObsSec, rStar, rBody, sky, vSky, periodSec, t0Sec } = args;
  const speed2 = vSky.x * vSky.x + vSky.y * vSky.y;
  if (!(rStar > 0 && rBody > 0 && speed2 > 0 && sky.z > 0)) return null;
  const dtCenter = -((sky.x * vSky.x + sky.y * vSky.y) / speed2);
  const cx = sky.x + vSky.x * dtCenter;
  const cy = sky.y + vSky.y * dtCenter;
  const cz = sky.z + vSky.z * dtCenter;
  if (!(cz > 0)) return null;
  const b = Math.hypot(cx, cy);
  const rSum = rStar + rBody;
  if (!(b < rSum)) return null;
  const chord = Math.sqrt(Math.max(0, rSum * rSum - b * b)) * 2;
  const durationSec = chord / Math.sqrt(speed2);
  const centerSec = tObsSec + dtCenter;
  const ingressSec = centerSec - durationSec / 2;
  const egressSec = centerSec + durationSec / 2;
  let ttvSec: number | undefined;
  if (Number.isFinite(periodSec) && (periodSec as number) > 0 && Number.isFinite(t0Sec)) {
    const k = Math.round((centerSec - (t0Sec as number)) / (periodSec as number));
    const centerEphem = (t0Sec as number) + k * (periodSec as number);
    ttvSec = centerSec - centerEphem;
  }
  return { centerSec, durationSec, ingressSec, egressSec, ttvSec };
}

function computeTimingAndObservables(
  config: SimulationConfigV4,
  snap: NativeSnapshot,
  tObsSec: number,
): {
  timing?: StepTimingDiagnostics;
  observables?: StepObservables;
  bPlanet?: number;
  bMoon?: number;
  vPlanetSky?: number;
  vPlanetSkyRef?: number;
  tdvRatio?: number;
} {
  const starRef = snap.stars[0];
  const planet = snap.planets[0] ?? snap.stars[1];
  const moon = snap.moons[0];
  const obs = snap.observerDir;

  const rv = (v: Vec3): number => {
    const d = vNormalizeOrZero(obs);
    if (!vIsFinite(v) || vLenSq(d) <= 0) return 0;
    return -(v.x * d.x + v.y * d.y + v.z * d.z);
  };

  const relPlanetSky = {
    x: planet.sky.x - starRef.sky.x,
    y: planet.sky.y - starRef.sky.y,
    z: planet.sky.z - starRef.sky.z,
  };
  const planetVSky = projectToSky(vSub(planet.vAbs, starRef.vAbs), obs);
  const pEvent = estimateTransitEvent({
    tObsSec,
    rStar: starRef.r,
    rBody: planet.r,
    sky: relPlanetSky,
    vSky: planetVSky,
    periodSec:
      (planet.source as PlanetBodyV4).orbit?.period ??
      (planet.id === snap.stars[1]?.id ? config.orbits.binary.period : undefined),
    t0Sec:
      (planet.source as PlanetBodyV4).orbit?.t0 ??
      (planet.id === snap.stars[1]?.id ? config.orbits.binary.t0 : undefined),
  });

  let mEvent: ReturnType<typeof estimateTransitEvent> = null;
  let relMoonSky: { x: number; y: number; z: number } | undefined;
  let moonVSky: { x: number; y: number; z: number } | undefined;
  if (moon) {
    relMoonSky = {
      x: moon.sky.x - starRef.sky.x,
      y: moon.sky.y - starRef.sky.y,
      z: moon.sky.z - starRef.sky.z,
    };
    moonVSky = projectToSky(vSub(moon.vAbs, starRef.vAbs), obs);
    mEvent = estimateTransitEvent({
      tObsSec,
      rStar: starRef.r,
      rBody: moon.r,
      sky: relMoonSky,
      vSky: moonVSky,
      periodSec: (moon.source as MoonBodyV4).orbit.period,
      t0Sec: (moon.source as MoonBodyV4).orbit.t0,
    });
  }

  const timing: StepTimingDiagnostics | undefined =
    pEvent || mEvent
      ? {
          planetTransitCenterSec: pEvent?.centerSec,
          planetTransitDurationSec: pEvent?.durationSec,
          planetIngressSec: pEvent?.ingressSec,
          planetEgressSec: pEvent?.egressSec,
          planetTtvSec: pEvent?.ttvSec,
          moonTransitCenterSec: mEvent?.centerSec,
          moonTransitDurationSec: mEvent?.durationSec,
          moonIngressSec: mEvent?.ingressSec,
          moonEgressSec: mEvent?.egressSec,
          moonTtvSec: mEvent?.ttvSec,
        }
      : undefined;

  const vPlanetSky = Math.hypot(planetVSky.x, planetVSky.y);
  const tRef = finiteOrDefault(config.dynamics?.exomoonTimingShape?.tRef, 0);
  const pRelRef = orbitStateAt(
    planet.id === snap.stars[1]?.id
      ? config.orbits.binary
      : ((planet.source as PlanetBodyV4).orbit ?? config.orbits.binary),
    tRef,
  );
  const vPlanetSkyRef = Math.hypot(projectToSky(pRelRef.v, obs).x, projectToSky(pRelRef.v, obs).y);
  const tdvRatio = vPlanetSky > 0 ? vPlanetSkyRef / vPlanetSky : undefined;
  const bPlanet = starRef.r > 0 ? Math.abs(relPlanetSky.y) / starRef.r : undefined;
  const bMoon = moon && relMoonSky && starRef.r > 0 ? Math.abs(relMoonSky.y) / starRef.r : undefined;

  const observables: StepObservables = {
    rvStar: rv(starRef.vAbs),
    rvPlanet: rv(planet.vAbs),
    rvMoon: moon ? rv(moon.vAbs) : undefined,
    astrometricOffsetStar: { x: starRef.sky.x, y: starRef.sky.y },
    timing,
  };

  return {
    timing,
    observables,
    bPlanet,
    bMoon,
    vPlanetSky,
    vPlanetSkyRef,
    tdvRatio,
  };
}

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
  const physicsEnergyDrift =
    Number.isFinite(nextBaseline.energy) && nextBaseline.energy !== 0
      ? (energy - (nextBaseline.energy as number)) / Math.abs(nextBaseline.energy as number)
      : undefined;
  const physicsAngularMomentumDrift =
    Number.isFinite(nextBaseline.angularMomentum) && (nextBaseline.angularMomentum as number) !== 0
      ? (angularMomentum - (nextBaseline.angularMomentum as number)) /
        Math.abs(nextBaseline.angularMomentum as number)
      : undefined;
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
  const planet = config.bodies.planets[0];
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
  const signals = computeDidacticSignals(pseudo, {
    fluxTotal: flux.total,
    fluxTransitFactor: flux.transitFactor,
    planetSky: { x: 0, y: finiteOrDefault(diag.bPlanet, 0) * Math.max(1, star.r), z: 1 },
    moonSky: undefined,
    meta: {
      t: tObsSec,
      bPlanet: diag.bPlanet,
      bMoon: diag.bMoon,
      tdvRatio: diag.tdvRatio,
      observables: diag.observables,
    },
  });
  return {
    signals,
    learningProgress: config.didactics.learningState,
  };
}

function renderSignalsFromSnapshot(
  snap: NativeSnapshot,
  flux: FluxBundle,
  timing: StepTimingDiagnostics | undefined,
): RenderSignalsV3 {
  const visualPlanet = snap.planets[0] ?? snap.stars[1];
  const visualMoon = snap.moons[0];
  const occulterGeometry: RenderSignalsV3["occulterGeometry"] = [];
  if (visualPlanet && visualPlanet.r > 0) {
    occulterGeometry.push({
      body: "planet",
      kind: "circle",
      center: visualPlanet.sky,
      radius: visualPlanet.r,
    });
  }
  if (visualMoon && visualMoon.r > 0) {
    occulterGeometry.push({
      body: "moon",
      kind: "circle",
      center: visualMoon.sky,
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
      total: flux.total,
    },
    orbitFrames: {
      observerDir: snap.observerDir,
      planetSky: visualPlanet?.sky ?? { x: 0, y: 0, z: 0 },
      moonSky: visualMoon?.sky,
    },
    uncertaintyFlags: [],
  };
}

export function stepNativeSimulationV4(args: {
  config: SimulationConfigV4;
  tObsSec: number;
  mode: RuntimeModeV4;
  conservationBaseline?: ConservationBaseline;
}): {
  step: SimulationStepV3;
  conservationBaseline: ConservationBaseline;
} {
  const { config, tObsSec, mode } = args;
  const snap = buildNativeSnapshot(config, tObsSec);
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
    binaryEclipseTerms: flux.transitFactor,
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
    total: flux.total,
  };

  const physicsDiagnostics: PhysicsDiagnosticsV3 = {
    ltteConvergence: {
      enabled: Boolean(config.dynamics?.relativity?.enabled && config.dynamics?.relativity?.ltte),
      status: config.dynamics?.relativity?.enabled && config.dynamics?.relativity?.ltte ? "ok" : "disabled",
    },
    shapiroConvergence: {
      enabled: Boolean(config.dynamics?.relativity?.enabled && config.dynamics?.relativity?.shapiro),
      status:
        config.dynamics?.relativity?.enabled && config.dynamics?.relativity?.shapiro ? "ok" : "disabled",
    },
    integratorStats: {
      mode: mode === "reference" ? "adaptive-verlet" : "fixed-verlet",
      nbodyEnabled: true,
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
      baselineFluxUsed: flux.stellarA + flux.stellarB,
      stellarVariabilityFlux: flux.stellarVariability,
    },
  };

  return {
    step,
    conservationBaseline: conservation.baseline,
  };
}
