/**
 * Version-neutral outputs from the simulation boundary.
 *
 * ObservationFrame is scientific/domain data. BrowserRenderFrame is the
 * browser-facing projection that can evolve independently of the physics
 * result.
 */
import type { DidacticSignals, Observer, SkyPoint } from "../model/types";
import type {
  StepAdvancedTimingDiagnostics,
  StepConservationDiagnostics,
  StepEventTimingSolveDiagnostics,
  StepFluxDecomposition,
  StepObservables,
  StepTimingDiagnostics,
} from "../model/typesResults";

export type LearningProgress = {
  lessonId?: string;
  stepIndex?: number;
  passedStepIds?: readonly string[];
  lastScore?: number;
  updatedAtSec?: number;
};

export type SimulationFlux = {
  total: number;
  transitFactor: number;
  stellarPreTransit: number;
  stellarVariability: number;
  planetPhase: number;
  moonPhase: number;
  forwardScattering: number;
  ringScattering: number;
  refraction?: number;
  decomposition?: StepFluxDecomposition;
};

export type SimulationKinematics = {
  planetSky: SkyPoint;
  moonSky?: SkyPoint;
};

export type SimulationDidactics = {
  signals?: DidacticSignals;
  learningProgress?: LearningProgress;
  rubricScore?: number;
  rubricPass?: boolean;
  adaptiveHints?: string[];
};

export type SimulationDebug = {
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

export type RenderOcculterGeometry =
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

export type RenderEventMarker = {
  id: string;
  kind: "transit" | "mutual-event" | "conjunction" | "timing";
  label: string;
  active: boolean;
};

export type RenderTimingMarker = {
  id: string;
  seconds?: number;
};

export type BrowserRenderSignals = {
  occulterGeometry: RenderOcculterGeometry[];
  eventMarkers: RenderEventMarker[];
  timingMarkers: RenderTimingMarker[];
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
    refraction?: number;
    total: number;
  };
  orbitFrames: {
    observerDir?: Observer["dir"];
    planetSky: SkyPoint;
    moonSky?: SkyPoint;
  };
  uncertaintyFlags: string[];
};

export type ConvergenceDiagnostics = {
  enabled: boolean;
  status: "disabled" | "ok" | "unavailable";
  valueSec?: number;
  validityFlags?: string[];
};

export type IntegratorStats = {
  mode: "kepler" | "fixed-verlet" | "adaptive-verlet";
  nbodyEnabled: boolean;
  dtMaxSec?: number;
  softening?: number;
};

export type PhysicsDiagnostics = {
  ltteConvergence: ConvergenceDiagnostics;
  shapiroConvergence: ConvergenceDiagnostics;
  integratorStats: IntegratorStats;
  energyDrift?: number;
  angularMomentumDrift?: number;
  closeEncounterFlags: string[];
  advancedTiming?: StepAdvancedTimingDiagnostics;
};

/** Scientific and domain output for one observed simulation time. */
export type ObservationFrame = {
  tObsSec: number;
  kinematics: SimulationKinematics;
  flux: SimulationFlux;
  timing?: StepTimingDiagnostics;
  observables?: StepObservables;
  conservation?: StepConservationDiagnostics;
  physicsDiagnostics: PhysicsDiagnostics;
  didactics?: SimulationDidactics;
  debug?: SimulationDebug;
};

/** Browser-specific visualization projection for an observation frame. */
export type BrowserRenderFrame = {
  renderSignals: BrowserRenderSignals;
};

/** The complete browser simulation frame. */
export type SimulationFrame = ObservationFrame & BrowserRenderFrame;
