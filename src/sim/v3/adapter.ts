/**
 * Owns adapter support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import type { InstrumentNoiseSystematicsParams } from "../../core/instrumentNoiseTypes";
import { deepClone } from "../../core/clone";
import type { DidacticsParams, OrbitElements, PhotometryParams, SystemParams } from "../../core/types";
import { cloneParams } from "../../core/clone";
import { SCENARIO_DEFAULTS } from "../../config/defaults";
import type { DidacticsModuleConfigV3, SimulationConfigV3 } from "./types";

function toFixedOrbit(orbit: unknown, path: string): OrbitElements {
  if (typeof orbit === "function") {
    throw new Error(`${path} cannot use function-valued orbit providers in SimulationConfigV3.`);
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

type BodiesV3 = SimulationConfigV3["bodies"];
type DynamicsV3 = SimulationConfigV3["dynamics"];
type TimingRelativityV3 = SimulationConfigV3["timingRelativity"];
type ThermalV3 = SimulationConfigV3["thermal"];
type StellarSurfaceV3 = SimulationConfigV3["stellarSurface"];
type DetectorV3 = SimulationConfigV3["detector"];

export function toSimulationConfigV3(params: SystemParams): SimulationConfigV3 {
  const src = deepClone(params);
  const photometry = src.star.photometry ? deepClone(src.star.photometry) : undefined;

  return {
    version: "3",
    bodies: bodiesToV3(src),
    dynamics: deepClone(src.dynamics ?? {}),
    timingRelativity: timingRelativityToV3(src),
    photometry: photometryToV3(photometry),
    thermal: thermalToV3(photometry),
    stellarSurface: stellarSurfaceToV3(photometry),
    detector: detectorToV3(photometry),
    didactics: toDidacticsModuleV3(src.didactics),
    ui: defaultUiV3(),
    rendering: defaultRenderingV3(),
  };
}

function bodiesToV3(src: SystemParams): BodiesV3 {
  return {
    observer: src.observer,
    star: starToV3(src),
    planet: {
      ...src.planet,
      orbit: toFixedOrbit(src.planet.orbit, "planet.orbit"),
    },
    moon: moonToV3(src),
  };
}

function starToV3(src: SystemParams): BodiesV3["star"] {
  const starBody = deepClone(src.star);
  delete (starBody as { photometry?: unknown }).photometry;
  return starBody;
}

function moonToV3(src: SystemParams): BodiesV3["moon"] {
  return src.moon
    ? {
        ...src.moon,
        orbitAroundPlanet: toFixedOrbit(src.moon.orbitAroundPlanet, "moon.orbitAroundPlanet"),
      }
    : undefined;
}

function timingRelativityToV3(src: SystemParams): TimingRelativityV3 {
  return src.dynamics?.relativity
    ? {
        ...deepClone(src.dynamics.relativity),
        level: src.dynamics?.relativityLevel,
      }
    : undefined;
}

function photometryToV3(photometry: PhotometryParams | undefined): PhotometryParams | undefined {
  return photometry
    ? {
        ...photometry,
        thermalModelAdvanced: undefined,
        stellarSurface: undefined,
        instrument: undefined,
        instrumentNoise: undefined,
      }
    : undefined;
}

function thermalToV3(photometry: PhotometryParams | undefined): ThermalV3 {
  return {
    enabled: hasThermalModule(photometry),
    planetInertia: photometry?.phaseCurve?.thermalInertia,
    moonInertia: photometry?.moonPhaseCurve?.thermalInertia,
    advancedModel: photometry?.thermalModelAdvanced,
  };
}

function hasThermalModule(photometry: PhotometryParams | undefined): boolean {
  return Boolean(
    photometry?.thermalModelAdvanced ||
      photometry?.phaseCurve?.thermalInertia ||
      photometry?.moonPhaseCurve?.thermalInertia,
  );
}

function stellarSurfaceToV3(photometry: PhotometryParams | undefined): StellarSurfaceV3 {
  return {
    enabled: Boolean(photometry?.stellarSurface?.enabled),
    model: photometry?.stellarSurface,
  };
}

function detectorToV3(photometry: PhotometryParams | undefined): DetectorV3 {
  const detector = resolveInstrumentNoise(photometry);
  return detector
    ? {
        enabled: detector.enabled,
        model: detector,
      }
    : undefined;
}

function defaultUiV3(): NonNullable<SimulationConfigV3["ui"]> {
  return {
    language: "en",
    layout: "lab",
    theme: "science",
  };
}

function defaultRenderingV3(): NonNullable<SimulationConfigV3["rendering"]> {
  return {
    overlayDensity: "high",
    eventLayer: true,
    physicsVisibility: "full",
    didacticMode: "scientific",
  };
}

export function toSystemParamsV2(config: SimulationConfigV3): SystemParams {
  const photometry = photometryFromV3(config);
  const dynamics = dynamicsFromV3(config);

  return {
    observer: deepClone(config.bodies.observer),
    star: {
      ...deepClone(config.bodies.star),
      photometry,
    },
    planet: deepClone(config.bodies.planet),
    moon: config.bodies.moon ? deepClone(config.bodies.moon) : undefined,
    dynamics,
    didactics: didacticsFromV3(config.didactics),
  };
}

function photometryFromV3(config: SimulationConfigV3): PhotometryParams {
  const photometry: PhotometryParams = deepClone(config.photometry ?? {});
  applyThermalModuleV3(photometry, config.thermal);
  applyStellarSurfaceModuleV3(photometry, config.stellarSurface);
  applyDetectorModuleV3(photometry, config.detector);
  return photometry;
}

function applyThermalModuleV3(photometry: PhotometryParams, thermal: ThermalV3): void {
  if (!thermal?.enabled) return;
  applyPlanetThermalInertia(photometry, thermal);
  applyMoonThermalInertia(photometry, thermal);
  if (thermal.advancedModel) photometry.thermalModelAdvanced = thermal.advancedModel;
}

function applyPlanetThermalInertia(photometry: PhotometryParams, thermal: ThermalV3): void {
  if (!thermal?.planetInertia) return;
  photometry.phaseCurve = {
    ...(photometry.phaseCurve ?? {}),
    thermalInertia: thermal.planetInertia,
  };
}

function applyMoonThermalInertia(photometry: PhotometryParams, thermal: ThermalV3): void {
  if (!thermal?.moonInertia) return;
  photometry.moonPhaseCurve = {
    ...(photometry.moonPhaseCurve ?? {}),
    thermalInertia: thermal.moonInertia,
  };
}

function applyStellarSurfaceModuleV3(photometry: PhotometryParams, stellarSurface: StellarSurfaceV3): void {
  if (stellarSurface?.enabled && stellarSurface.model) photometry.stellarSurface = stellarSurface.model;
}

function applyDetectorModuleV3(photometry: PhotometryParams, detector: DetectorV3): void {
  if (detector?.enabled && detector.model) photometry.instrument = detector.model;
}

function didacticsFromV3(didactics: SimulationConfigV3["didactics"]): DidacticsParams | undefined {
  return didactics
    ? {
        enabled: didactics.enabled,
        activeLessonId: didactics.curriculumId,
        autoAssess: didactics.autoAssess,
        learningState: learningStateFromV3(didactics.learningProgress),
      }
    : undefined;
}

function learningStateFromV3(
  learningProgress: NonNullable<SimulationConfigV3["didactics"]>["learningProgress"],
): NonNullable<DidacticsParams["learningState"]> | undefined {
  return learningProgress
    ? {
        lessonId: learningProgress.lessonId ?? "kepler-geometry",
        stepIndex: learningProgress.stepIndex ?? 0,
        passedStepIds: learningProgress.passedStepIds ?? [],
        lastScore: learningProgress.lastScore,
        updatedAtSec: learningProgress.updatedAtSec,
      }
    : undefined;
}

function dynamicsFromV3(config: SimulationConfigV3): DynamicsV3 {
  const dynamics = deepClone(config.dynamics ?? {});
  applyTimingRelativityV3(dynamics, config.timingRelativity);
  return dynamics;
}

function applyTimingRelativityV3(dynamics: DynamicsV3, timingRelativity: TimingRelativityV3): void {
  if (!timingRelativity) return;
  dynamics.relativity = relativityFromV3(timingRelativity);
  if (timingRelativity.level) dynamics.relativityLevel = timingRelativity.level;
}

function relativityFromV3(timingRelativity: NonNullable<TimingRelativityV3>): DynamicsV3["relativity"] {
  return deepClone({
    enabled: timingRelativity.enabled,
    ltte: timingRelativity.ltte,
    shapiro: timingRelativity.shapiro,
    grPrecession: timingRelativity.grPrecession,
    einsteinDelay: timingRelativity.einsteinDelay,
    lightBending: timingRelativity.lightBending,
    c: timingRelativity.c,
    timingRefSec: timingRelativity.timingRefSec,
    planetPrecessionPerOrbit: timingRelativity.planetPrecessionPerOrbit,
    moonPrecessionPerOrbit: timingRelativity.moonPrecessionPerOrbit,
    ltteIters: timingRelativity.ltteIters,
    ltteTolSec: timingRelativity.ltteTolSec,
    shapiroMinImpact: timingRelativity.shapiroMinImpact,
  });
}

export function createDefaultSimulationConfigV3(): SimulationConfigV3 {
  return toSimulationConfigV3(cloneParams(SCENARIO_DEFAULTS));
}
