import { deepClone } from "../../core/clone";
import { toFiniteNumber } from "../../core/units";
import type { SystemParams } from "../../core/types";
import { getDidacticsV3Hook } from "../didacticsHook";
import { prepareSimulation, stepSystem } from "../sim";
import { toSystemParamsV2 } from "./adapter";
import type {
  DidacticCurriculumV3,
  LearningProgressV3,
  PhysicsDiagnosticsV3,
  RenderSignalsV3,
  SimulationConfigV3,
  SimulationDidacticsV3,
  SimulationRuntime,
  SimulationSeriesV3,
  SimulationStepV3,
  TimeRange,
} from "./types";
import { assertValidSimulationConfigV3, assertValidTimeRange } from "./validation";

export function sampleRangeSeconds(startSec: number, endSec: number, stepSec: number): TimeRange {
  return { startSec, endSec, stepSec };
}

function buildRenderSignals(system: SystemParams, step: ReturnType<typeof stepSystem>): RenderSignalsV3 {
  const occulterGeometry: RenderSignalsV3["occulterGeometry"] = [];

  occulterGeometry.push({
    body: "planet",
    kind:
      Number.isFinite(system.planet.shape?.oblateness) && (system.planet.shape?.oblateness ?? 0) > 0
        ? "ellipse"
        : "circle",
    center: step.planetSky,
    ...(Number.isFinite(system.planet.shape?.oblateness) && (system.planet.shape?.oblateness ?? 0) > 0
      ? {
          rx: system.planet.r,
          ry: system.planet.r * (1 - (system.planet.shape?.oblateness ?? 0)),
          angle: toFiniteNumber(system.planet.shape?.angle, 0),
        }
      : { radius: system.planet.r }),
  } as RenderSignalsV3["occulterGeometry"][number]);

  if (system.planet.rings) {
    occulterGeometry.push({
      body: "planet",
      kind: "ring",
      center: step.planetSky,
      innerRadius: system.planet.rings.innerRadius,
      outerRadius: system.planet.rings.outerRadius,
      inclination: toFiniteNumber(system.planet.rings.inclination, 0),
      angle: toFiniteNumber(system.planet.rings.positionAngle, 0),
    });
  }

  if (system.moon && step.moonSky) {
    occulterGeometry.push({
      body: "moon",
      kind:
        Number.isFinite(system.moon.shape?.oblateness) && (system.moon.shape?.oblateness ?? 0) > 0
          ? "ellipse"
          : "circle",
      center: step.moonSky,
      ...(Number.isFinite(system.moon.shape?.oblateness) && (system.moon.shape?.oblateness ?? 0) > 0
        ? {
            rx: system.moon.r,
            ry: system.moon.r * (1 - (system.moon.shape?.oblateness ?? 0)),
            angle: toFiniteNumber(system.moon.shape?.angle, 0),
          }
        : { radius: system.moon.r }),
    } as RenderSignalsV3["occulterGeometry"][number]);

    if (system.moon.rings) {
      occulterGeometry.push({
        body: "moon",
        kind: "ring",
        center: step.moonSky,
        innerRadius: system.moon.rings.innerRadius,
        outerRadius: system.moon.rings.outerRadius,
        inclination: toFiniteNumber(system.moon.rings.inclination, 0),
        angle: toFiniteNumber(system.moon.rings.positionAngle, 0),
      });
    }
  }

  const transitActive = toFiniteNumber(step.fluxTransitFactor, 1) < 0.999999;
  const mutualActive =
    toFiniteNumber(step.meta?.planetVisibleFraction, 1) < 0.999999 ||
    toFiniteNumber(step.meta?.moonVisibleFraction, 1) < 0.999999;
  const conjunctionActive =
    Boolean(step.moonSky) &&
    Math.hypot(step.planetSky.x - (step.moonSky?.x ?? 0), step.planetSky.y - (step.moonSky?.y ?? 0)) <
      system.planet.r + (system.moon?.r ?? 0);

  const eventMarkers: RenderSignalsV3["eventMarkers"] = [
    { id: "transit", kind: "transit", label: "Transit attenuation active", active: transitActive },
    { id: "mutual", kind: "mutual-event", label: "Mutual event active", active: mutualActive },
    { id: "conjunction", kind: "conjunction", label: "Planet-moon conjunction", active: conjunctionActive },
    {
      id: "timing-correction",
      kind: "timing",
      label: "Timing correction available",
      active: Boolean(
        step.meta?.timing?.lttePlanetSec ||
        step.meta?.timing?.shapiroPlanetSec ||
        step.meta?.timing?.planetTransitDurationSec,
      ),
    },
  ];

  const timingMarkers: RenderSignalsV3["timingMarkers"] = [
    { id: "lttePlanetSec", seconds: step.meta?.timing?.lttePlanetSec },
    { id: "ltteMoonSec", seconds: step.meta?.timing?.ltteMoonSec },
    { id: "shapiroPlanetSec", seconds: step.meta?.timing?.shapiroPlanetSec },
    { id: "shapiroMoonSec", seconds: step.meta?.timing?.shapiroMoonSec },
    { id: "planetTransitCenterSec", seconds: step.meta?.timing?.planetTransitCenterSec },
    { id: "planetTransitDurationSec", seconds: step.meta?.timing?.planetTransitDurationSec },
    { id: "planetTtvSec", seconds: step.meta?.timing?.planetTtvSec },
    { id: "moonTransitCenterSec", seconds: step.meta?.timing?.moonTransitCenterSec },
    { id: "moonTransitDurationSec", seconds: step.meta?.timing?.moonTransitDurationSec },
    { id: "moonTtvSec", seconds: step.meta?.timing?.moonTtvSec },
  ].filter((x) => Number.isFinite(x.seconds));

  const uncertaintyFlags: string[] = [];
  if (!Number.isFinite(step.fluxTotal)) uncertaintyFlags.push("nonfinite-total-flux");
  if (system.dynamics?.nbodyPlanetMoon?.enabled && !step.meta?.conservation) {
    uncertaintyFlags.push("missing-conservation-diagnostics");
  }
  if (system.dynamics?.relativity?.enabled && !step.meta?.timing) {
    uncertaintyFlags.push("missing-timing-diagnostics");
  }

  return {
    occulterGeometry,
    eventMarkers,
    timingMarkers,
    visibilityFractions: {
      planet: step.meta?.planetVisibleFraction,
      moon: step.meta?.moonVisibleFraction,
    },
    fluxComponents: {
      transitFactor: toFiniteNumber(step.fluxTransitFactor, 1),
      stellarPreTransit: toFiniteNumber(step.fluxStellarPreTransit, 1),
      stellarVariability: toFiniteNumber(step.fluxStellarVar, 0),
      planetPhase: toFiniteNumber(step.fluxPlanetPhase, 0),
      moonPhase: toFiniteNumber(step.fluxMoonPhase, 0),
      forwardScattering: toFiniteNumber(step.fluxForwardScattering, 0),
      ringScattering: toFiniteNumber(step.fluxRingScattering, 0),
      total: toFiniteNumber(step.fluxTotal, 1),
    },
    orbitFrames: {
      observerDir: system.observer?.dir,
      planetSky: step.planetSky,
      moonSky: step.moonSky,
    },
    uncertaintyFlags,
  };
}

function buildPhysicsDiagnostics(
  system: SystemParams,
  step: ReturnType<typeof stepSystem>,
): PhysicsDiagnosticsV3 {
  const rel = system.dynamics?.relativity;
  const timing = step.meta?.timing;
  const nbody = system.dynamics?.nbodyPlanetMoon;
  const nbodyEnabled = Boolean(nbody?.enabled);

  const ltteEnabled = Boolean(rel?.enabled && rel?.ltte);
  const shapiroEnabled = Boolean(rel?.enabled && rel?.shapiro);
  const ltteValue = Number.isFinite(timing?.lttePlanetSec)
    ? Math.abs(timing!.lttePlanetSec as number)
    : undefined;
  const shapiroValue = Number.isFinite(timing?.shapiroPlanetSec)
    ? Math.abs(timing!.shapiroPlanetSec as number)
    : undefined;

  const mode = nbodyEnabled
    ? ((nbody?.integrator?.mode ?? system.dynamics?.integrator?.mode ?? "fixed-verlet") as
        | "fixed-verlet"
        | "adaptive-verlet")
    : "kepler";

  const closeEncounterFlags: string[] = [];
  if (nbodyEnabled && toFiniteNumber(nbody?.softening, 0) === 0) closeEncounterFlags.push("zero-softening");
  if (nbodyEnabled && !step.meta?.conservation) closeEncounterFlags.push("no-conservation-data");

  return {
    ltteConvergence: {
      enabled: ltteEnabled,
      status: !ltteEnabled ? "disabled" : ltteValue !== undefined ? "ok" : "unavailable",
      valueSec: ltteValue,
    },
    shapiroConvergence: {
      enabled: shapiroEnabled,
      status: !shapiroEnabled ? "disabled" : shapiroValue !== undefined ? "ok" : "unavailable",
      valueSec: shapiroValue,
    },
    integratorStats: {
      mode,
      nbodyEnabled,
      dtMaxSec: nbody?.dtMax,
      softening: nbody?.softening,
    },
    energyDrift: step.meta?.conservation?.energy,
    angularMomentumDrift: step.meta?.conservation?.angularMomentum,
    closeEncounterFlags,
  };
}

function selectCurriculum(config: SimulationConfigV3): DidacticCurriculumV3 | undefined {
  const list = config.didactics?.curriculum;
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list.find((c) => c.id === config.didactics?.curriculumId) ?? list[0];
}

function mapStepToV3(
  step: ReturnType<typeof stepSystem>,
  tObsSec: number,
  system: SystemParams,
  didactics: SimulationDidacticsV3,
): SimulationStepV3 {
  return {
    tObsSec: toFiniteNumber(step.meta?.t, tObsSec),
    kinematics: {
      planetSky: step.planetSky,
      moonSky: step.moonSky,
    },
    flux: {
      total: toFiniteNumber(step.fluxTotal, 1),
      transitFactor: toFiniteNumber(step.fluxTransitFactor, 1),
      stellarPreTransit: toFiniteNumber(step.fluxStellarPreTransit, 1),
      stellarVariability: toFiniteNumber(step.fluxStellarVar, 0),
      planetPhase: toFiniteNumber(step.fluxPlanetPhase, 0),
      moonPhase: toFiniteNumber(step.fluxMoonPhase, 0),
      forwardScattering: toFiniteNumber(step.fluxForwardScattering, 0),
      ringScattering: toFiniteNumber(step.fluxRingScattering, 0),
      decomposition: step.meta?.fluxDecomposition,
    },
    timing: step.meta?.timing,
    observables: step.meta?.observables,
    conservation: step.meta?.conservation,
    renderSignals: buildRenderSignals(system, step),
    physicsDiagnostics: buildPhysicsDiagnostics(system, step),
    didactics,
    debug: {
      nOcculters: step.meta?.nOcculters,
      bPlanet: step.meta?.bPlanet,
      bMoon: step.meta?.bMoon,
      tdvRatio: step.meta?.tdvRatio,
      vPlanetSky: step.meta?.vPlanetSky,
      vPlanetSkyRef: step.meta?.vPlanetSkyRef,
      baselineFluxUsed: step.meta?.baselineFluxUsed,
      stellarVariabilityFlux: step.meta?.stellarVariabilityFlux,
    },
  };
}

export function createSimulation(config: SimulationConfigV3): SimulationRuntime {
  const cfg = deepClone(config);
  assertValidSimulationConfigV3(cfg);
  const system = toSystemParamsV2(cfg);
  const progress: LearningProgressV3 = deepClone(
    cfg.didactics?.learningProgress ?? {
      lessonId: cfg.didactics?.curriculumId,
      stepIndex: 0,
      passedStepIds: [],
    },
  );
  const stepAt = (tObsSec: number): SimulationStepV3 => {
    if (!Number.isFinite(tObsSec)) throw new Error("SimulationRuntime.step: tObsSec must be finite.");
    const step = stepSystem(system, tObsSec);
    const signals = step.meta?.didacticSignals;
    const curriculum = selectCurriculum(cfg);
    let didactics: SimulationDidacticsV3 = {
      signals,
      learningProgress: deepClone(progress),
    };

    const evaluateDidacticsV3 = getDidacticsV3Hook();
    if (curriculum && evaluateDidacticsV3) {
      const evaluated = evaluateDidacticsV3({
        curriculum,
        progress,
        signals,
        hintPolicy: cfg.didactics?.hintPolicy,
      });

      didactics = {
        signals: signals
          ? {
              ...signals,
              hints: [...(signals.hints ?? []), ...evaluated.hints],
            }
          : signals,
        learningProgress: deepClone(progress),
        rubricScore: evaluated.rubricScore,
        rubricPass: evaluated.rubricPass,
        adaptiveHints: evaluated.hints,
      };
    }

    return mapStepToV3(step, tObsSec, system, didactics);
  };

  return {
    prepare: async () => {
      await prepareSimulation(system);
    },
    step: stepAt,
    sample: (range: TimeRange): SimulationSeriesV3 => {
      assertValidTimeRange(range);
      const steps: SimulationStepV3[] = [];

      // Inclusive upper bound with a small tolerance to avoid floating-point fencepost misses.
      // Use index-based loop to prevent floating-point drift from repeated accumulation.
      const tol = Math.abs(range.stepSec) * 1e-9;
      for (let i = 0, t = range.startSec; t <= range.endSec + tol; i++, t = range.startSec + i * range.stepSec) {
        steps.push(stepAt(t));
      }

      return {
        range: deepClone(range),
        steps,
      };
    },
    getConfig: () => deepClone(cfg),
  };
}
