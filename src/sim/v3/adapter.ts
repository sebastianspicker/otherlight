import type { InstrumentNoiseSystematicsParams } from "../../core/instrumentNoiseTypes";
import type { DidacticsParams, OrbitElements, PhotometryParams, SystemParams } from "../../core/types";
import { cloneParams, SCENARIO_DEFAULTS } from "../../app/scenario";
import type { DidacticsModuleConfigV3, SimulationConfigV3 } from "./types";

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toFixedOrbit(orbit: unknown, path: string): OrbitElements {
  if (typeof orbit === "function") {
    throw new Error(`${path} must be static OrbitElements in SimulationConfigV3.`);
  }
  return deepClone(orbit as OrbitElements);
}

function resolveInstrumentNoise(
  ph: PhotometryParams | undefined,
): InstrumentNoiseSystematicsParams | undefined {
  return ph?.instrument ?? ph?.instrumentNoise;
}

function toDidacticsModuleV3(did: DidacticsParams | undefined): DidacticsModuleConfigV3 | undefined {
  if (!did) return undefined;
  return {
    enabled: did.enabled,
    curriculumId: did.activeLessonId,
    autoAssess: did.autoAssess,
    learningProgress: did.learningState
      ? {
          lessonId: did.learningState.lessonId,
          stepIndex: did.learningState.stepIndex,
          passedStepIds: did.learningState.passedStepIds,
          lastScore: did.learningState.lastScore,
          updatedAtSec: did.learningState.updatedAtSec,
        }
      : undefined,
  };
}

export function toSimulationConfigV3(params: SystemParams): SimulationConfigV3 {
  const src = deepClone(params);
  const starBody = deepClone(src.star);
  delete (starBody as { photometry?: unknown }).photometry;
  const photometry = src.star.photometry ? deepClone(src.star.photometry) : undefined;
  const detector = resolveInstrumentNoise(photometry);

  return {
    version: "3",
    bodies: {
      observer: src.observer,
      star: starBody,
      planet: {
        ...src.planet,
        orbit: toFixedOrbit(src.planet.orbit, "planet.orbit"),
      },
      moon: src.moon
        ? {
            ...src.moon,
            orbitAroundPlanet: toFixedOrbit(src.moon.orbitAroundPlanet, "moon.orbitAroundPlanet"),
          }
        : undefined,
    },
    dynamics: deepClone(src.dynamics ?? {}),
    timingRelativity: src.dynamics?.relativity
      ? {
          ...deepClone(src.dynamics.relativity),
          level: src.dynamics?.relativityLevel,
        }
      : undefined,
    photometry: photometry
      ? {
          ...photometry,
          thermalModelAdvanced: undefined,
          stellarSurface: undefined,
          instrument: undefined,
          instrumentNoise: undefined,
        }
      : undefined,
    thermal: {
      enabled: Boolean(
        photometry?.thermalModelAdvanced ||
        photometry?.phaseCurve?.thermalInertia ||
        photometry?.moonPhaseCurve?.thermalInertia,
      ),
      planetInertia: photometry?.phaseCurve?.thermalInertia,
      moonInertia: photometry?.moonPhaseCurve?.thermalInertia,
      advancedModel: photometry?.thermalModelAdvanced,
    },
    stellarSurface: {
      enabled: Boolean(photometry?.stellarSurface?.enabled),
      model: photometry?.stellarSurface,
    },
    detector: detector
      ? {
          enabled: detector.enabled,
          model: detector,
        }
      : undefined,
    didactics: toDidacticsModuleV3(src.didactics),
    ui: {
      language: "en",
      layout: "lab",
      theme: "science",
    },
    rendering: {
      overlayDensity: "high",
      eventLayer: true,
      physicsVisibility: "full",
      didacticMode: "scientific",
    },
  };
}

export function toSystemParamsV2(config: SimulationConfigV3): SystemParams {
  const photometry: PhotometryParams = deepClone(config.photometry ?? {});

  if (config.thermal?.enabled) {
    if (config.thermal.planetInertia) {
      photometry.phaseCurve = {
        ...(photometry.phaseCurve ?? {}),
        thermalInertia: config.thermal.planetInertia,
      };
    }
    if (config.thermal.moonInertia) {
      photometry.moonPhaseCurve = {
        ...(photometry.moonPhaseCurve ?? {}),
        thermalInertia: config.thermal.moonInertia,
      };
    }
    if (config.thermal.advancedModel) {
      photometry.thermalModelAdvanced = config.thermal.advancedModel;
    }
  }

  if (config.stellarSurface?.enabled && config.stellarSurface.model) {
    photometry.stellarSurface = config.stellarSurface.model;
  }

  if (config.detector?.enabled && config.detector.model) {
    photometry.instrument = config.detector.model;
  }

  const didactics: DidacticsParams | undefined = config.didactics
    ? {
        enabled: config.didactics.enabled,
        activeLessonId: config.didactics.curriculumId,
        autoAssess: config.didactics.autoAssess,
        learningState: config.didactics.learningProgress
          ? {
              lessonId: config.didactics.learningProgress.lessonId ?? "kepler-geometry",
              stepIndex: config.didactics.learningProgress.stepIndex ?? 0,
              passedStepIds: config.didactics.learningProgress.passedStepIds ?? [],
              lastScore: config.didactics.learningProgress.lastScore,
              updatedAtSec: config.didactics.learningProgress.updatedAtSec,
            }
          : undefined,
      }
    : undefined;

  const dynamics = deepClone(config.dynamics ?? {});
  if (config.timingRelativity) {
    dynamics.relativity = deepClone({
      enabled: config.timingRelativity.enabled,
      ltte: config.timingRelativity.ltte,
      shapiro: config.timingRelativity.shapiro,
      grPrecession: config.timingRelativity.grPrecession,
      c: config.timingRelativity.c,
      planetPrecessionPerOrbit: config.timingRelativity.planetPrecessionPerOrbit,
      moonPrecessionPerOrbit: config.timingRelativity.moonPrecessionPerOrbit,
      ltteIters: config.timingRelativity.ltteIters,
      ltteTolSec: config.timingRelativity.ltteTolSec,
      shapiroMinImpact: config.timingRelativity.shapiroMinImpact,
    });
    if (config.timingRelativity.level) dynamics.relativityLevel = config.timingRelativity.level;
  }

  return {
    observer: deepClone(config.bodies.observer),
    star: {
      ...deepClone(config.bodies.star),
      photometry,
    },
    planet: deepClone(config.bodies.planet),
    moon: config.bodies.moon ? deepClone(config.bodies.moon) : undefined,
    dynamics,
    didactics,
  };
}

export function createDefaultSimulationConfigV3(): SimulationConfigV3 {
  return toSimulationConfigV3(cloneParams(SCENARIO_DEFAULTS));
}
