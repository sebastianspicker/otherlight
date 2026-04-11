import type { InstrumentNoiseSystematicsParams } from "../../core/instrumentNoiseTypes";
import type {
  Body,
  DidacticSignals,
  DidacticsParams,
  LearningState,
  Observer,
  OrbitElements,
  PhotometryParams,
  SkyPoint,
  StepObservables,
  SystemDynamicsParams,
} from "../../core/types";
import type {
  StepConservationDiagnostics,
  StepEventTimingSolveDiagnostics,
  StepFluxDecomposition,
  StepTimingDiagnostics,
} from "../../core/typesResults";

export type DidacticRubricCriterionV3 = {
  id: string;
  description: string;
  weight: number;
};

export type AssessmentRubricV3 = {
  id: string;
  title: string;
  criteria: DidacticRubricCriterionV3[];
};

export type LessonStepV3 = {
  id: string;
  title: string;
  prompt: string;
  dependsOnStepIds?: string[];
  rubricId?: string;
};

export type DidacticCurriculumV3 = {
  id: string;
  title: string;
  steps: LessonStepV3[];
  rubrics?: AssessmentRubricV3[];
};

export type HintPolicyV3 = {
  enabled?: boolean;
  maxHintsPerStep?: number;
  strategy?: "adaptive" | "fixed";
};

export type LearningProgressV3 = {
  lessonId?: string;
  stepIndex?: number;
  passedStepIds?: readonly string[];
  lastScore?: number;
  updatedAtSec?: number;
};

export type ThermalModuleConfigV3 = {
  enabled?: boolean;
  planetInertia?: NonNullable<PhotometryParams["phaseCurve"]>["thermalInertia"];
  moonInertia?: NonNullable<PhotometryParams["moonPhaseCurve"]>["thermalInertia"];
  advancedModel?: PhotometryParams["thermalModelAdvanced"];
};

export type StellarSurfaceModuleConfigV3 = {
  enabled?: boolean;
  model?: PhotometryParams["stellarSurface"];
};

export type DetectorModuleConfigV3 = {
  enabled?: boolean;
  model?: InstrumentNoiseSystematicsParams;
};

export type DidacticsModuleConfigV3 = {
  enabled?: boolean;
  curriculumId?: string;
  autoAssess?: boolean;
  curriculum?: DidacticCurriculumV3[];
  hintPolicy?: HintPolicyV3;
  learningProgress?: LearningProgressV3;
};

export type UiModuleConfigV3 = {
  language?: "en" | "de";
  layout?: "lab" | "compact";
  theme?: string;
};

export type RenderConfigV3 = {
  overlayDensity?: "low" | "medium" | "high";
  eventLayer?: boolean;
  physicsVisibility?: "minimal" | "balanced" | "full";
  didacticMode?: "scientific" | "didactic";
};

export type TimingRelativityConfigV3 = NonNullable<SystemDynamicsParams["relativity"]> & {
  level?: NonNullable<SystemDynamicsParams["relativityLevel"]>;
};

export type OrbitalBodyV3 = Body & {
  orbit: OrbitElements;
};

export type OrbitalMoonV3 = Body & {
  orbitAroundPlanet: OrbitElements;
  sense?: "prograde" | "retrograde";
};

export type SimulationBodiesV3 = {
  observer?: Observer;
  star: Body;
  planet: OrbitalBodyV3;
  moon?: OrbitalMoonV3;
};

export type SimulationConfigV3 = {
  version: "3";
  bodies: SimulationBodiesV3;
  dynamics: SystemDynamicsParams;
  timingRelativity?: TimingRelativityConfigV3;
  photometry?: PhotometryParams;
  thermal?: ThermalModuleConfigV3;
  stellarSurface?: StellarSurfaceModuleConfigV3;
  detector?: DetectorModuleConfigV3;
  didactics?: DidacticsModuleConfigV3;
  ui?: UiModuleConfigV3;
  rendering?: RenderConfigV3;
};

export type SimulationFluxV3 = {
  total: number;
  transitFactor: number;
  stellarPreTransit: number;
  stellarVariability: number;
  planetPhase: number;
  moonPhase: number;
  forwardScattering: number;
  ringScattering: number;
  decomposition?: StepFluxDecomposition;
};

export type SimulationKinematicsV3 = {
  planetSky: SkyPoint;
  moonSky?: SkyPoint;
};

export type SimulationDidacticsV3 = {
  signals?: DidacticSignals;
  learningProgress?: LearningProgressV3;
  rubricScore?: number;
  rubricPass?: boolean;
  adaptiveHints?: string[];
};

export type SimulationDebugV3 = {
  nOcculters?: number;
  bPlanet?: number;
  bMoon?: number;
  tdvRatio?: number;
  vPlanetSky?: number;
  vPlanetSkyRef?: number;
  baselineFluxUsed?: number;
  displayFluxValue?: number;
  stellarVariabilityFlux?: number;
  eventTimingSolvePlanet?: StepEventTimingSolveDiagnostics;
  eventTimingSolveMoon?: StepEventTimingSolveDiagnostics;
};

export type RenderOcculterGeometryV3 =
  | {
      body: "planet" | "moon" | "star";
      kind: "circle";
      center: SkyPoint;
      radius: number;
    }
  | {
      body: "planet" | "moon" | "star";
      kind: "ellipse";
      center: SkyPoint;
      rx: number;
      ry: number;
      angle: number;
    }
  | {
      body: "planet" | "moon" | "star";
      kind: "ring";
      center: SkyPoint;
      innerRadius: number;
      outerRadius: number;
      inclination: number;
      angle: number;
    };

export type RenderEventMarkerV3 = {
  id: string;
  kind: "transit" | "mutual-event" | "conjunction" | "timing";
  label: string;
  active: boolean;
};

export type RenderTimingMarkerV3 = {
  id: string;
  seconds?: number;
};

export type RenderSignalsV3 = {
  occulterGeometry: RenderOcculterGeometryV3[];
  eventMarkers: RenderEventMarkerV3[];
  timingMarkers: RenderTimingMarkerV3[];
  visibilityFractions: {
    planet?: number;
    moon?: number;
  };
  fluxComponents: {
    transitFactor: number;
    stellarPreTransit: number;
    stellarVariability: number;
    planetPhase: number;
    moonPhase: number;
    forwardScattering: number;
    ringScattering: number;
    total: number;
  };
  orbitFrames: {
    observerDir?: Observer["dir"];
    planetSky: SkyPoint;
    moonSky?: SkyPoint;
  };
  uncertaintyFlags: string[];
};

export type ConvergenceDiagnosticsV3 = {
  enabled: boolean;
  status: "disabled" | "ok" | "unavailable";
  valueSec?: number;
  validityFlags?: string[];
};

export type IntegratorStatsV3 = {
  mode: "kepler" | "fixed-verlet" | "adaptive-verlet";
  nbodyEnabled: boolean;
  dtMaxSec?: number;
  softening?: number;
};

export type PhysicsDiagnosticsV3 = {
  ltteConvergence: ConvergenceDiagnosticsV3;
  shapiroConvergence: ConvergenceDiagnosticsV3;
  integratorStats: IntegratorStatsV3;
  energyDrift?: number;
  angularMomentumDrift?: number;
  closeEncounterFlags: string[];
};

export type SimulationStepV3 = {
  tObsSec: number;
  kinematics: SimulationKinematicsV3;
  flux: SimulationFluxV3;
  timing?: StepTimingDiagnostics;
  observables?: StepObservables;
  conservation?: StepConservationDiagnostics;
  renderSignals: RenderSignalsV3;
  physicsDiagnostics: PhysicsDiagnosticsV3;
  didactics?: SimulationDidacticsV3;
  debug?: SimulationDebugV3;
};

export type TimeRange = {
  startSec: number;
  endSec: number;
  stepSec: number;
};

export type SimulationSeriesV3 = {
  range: TimeRange;
  steps: SimulationStepV3[];
};

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationReportV3 = {
  ok: boolean;
  issues: ValidationIssue[];
};

export type SimulationRuntime = {
  prepare: () => Promise<void>;
  step: (tObsSec: number) => SimulationStepV3;
  sample: (range: TimeRange) => SimulationSeriesV3;
  getConfig: () => SimulationConfigV3;
};

export type LegacyDidacticsSnapshot = Pick<DidacticsParams, "enabled" | "activeLessonId" | "autoAssess"> & {
  learningState?: LearningState;
};
