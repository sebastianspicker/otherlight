/**
 * Shared frame-loop controller types used by reset/seek/frame orchestration.
 */
import type { ChromaticSampler } from "../../application/runtime/chromaticSampler";
import type { FixedPreviewKey, FixedPreviewPresentation } from "./fixedPreviewCache";
import type { ChromaticOverlay } from "./chromaticOverlay";
import type { BrowserScenarioDraft } from "../../domain/model/types";
import type { SimulationFrame } from "../../domain/simulation/frames";
import type { ApplyDynamicVisualizationStateArgs } from "./frameLoopDynamicVisualization";
import type { NoiseState } from "../../application/runtime/noise";
import type { TransitHistoryState } from "../../application/runtime/transitHistory";
import type { AppSimulationRuntime } from "../../application/runtime/v4Runtime";
import type { BinaryLabState } from "../../domain/education/binaryLab";
import type { Canvas2DRenderer } from "../render/sky/canvas2d";
import type { LightCurvePlot } from "../render/lightCurve/lightCurvePlot";
import type {
  LightCurveBadge,
  LightCurveComparisonInset,
  LightCurveOverlayPoint,
  LightCurveOverlaySeries,
} from "../render/lightCurve/lightCurvePlotTypes";
import type { SceneGhostGeometry } from "../render/sky/sceneTypes";
import type { UiRefs } from "../shell/refs";

export type FrameLoopState = {
  running: boolean;
  t: number;
  last: number;
  lastPlottedT: number;
  lastPlotMode: string | null;
  lastPlotTrackingMode: string | null;
  lastFluxForPlot: number;
  lastValidFrame: SimulationFrame | null;
  displayFluxScale: number;
  displayFluxTitle: string;
  fixedPreviewKey?: FixedPreviewKey;
  fixedPreviewPresentation?: FixedPreviewPresentation;
  previewGeneration?: number;
  chromaticOverlay?: ChromaticOverlay;
  fixedPlotYRange?: { lo: number; hi: number };
  fixedPlotYRangeMode?: string | null;
  noise: NoiseState;
  transitHistory: TransitHistoryState;
  physicalHistory: LightCurveOverlayPoint[];
  measuredHistory: LightCurveOverlayPoint[];
  componentBaselineHistory: LightCurveOverlayPoint[];
  componentTransitHistory: LightCurveOverlayPoint[];
  componentScatterHistory: LightCurveOverlayPoint[];
  comparisonCurveSeries?: LightCurveOverlaySeries[];
  comparisonInset?: LightCurveComparisonInset;
  comparisonGhosts?: SceneGhostGeometry[];
  comparisonBadges?: LightCurveBadge[];
};

export type FrameLoopDeps = {
  chromaticSampler?: ChromaticSampler;
  refs: UiRefs;
  renderer: Canvas2DRenderer;
  plot: LightCurvePlot;
  state: FrameLoopState;
  getSimulation: () => AppSimulationRuntime;
  getParams: () => BrowserScenarioDraft;
  getBinaryLabState: () => BinaryLabState;
  isBinaryModeActive: () => boolean;
  uiWarningText: (p: BrowserScenarioDraft) => string | undefined;
  onSampleStep: (step: SimulationFrame, tSec: number) => void;
  renderOcPanel: () => void;
};

export type FrameLoopControllerApi = {
  frame: (now: number) => void;
  start: () => void;
  dispose: () => void;
  setRunning: (next: boolean) => void;
  resetSimTimeAndLC: (opts?: { resetNoise?: boolean }) => void;
  seekToTime: (targetSec: number, opts?: { resetNoise?: boolean }) => void;
  invalidate: () => void;
};

export type SampleFluxForPlot = (
  simulation: AppSimulationRuntime,
  params: BrowserScenarioDraft,
  plotMode: string,
  tSec: number,
  dtSec: number,
  noiseState?: NoiseState["noiseState"],
  stepAtTime?: SimulationFrame,
) => number;

export type FrameLoopContext = FrameLoopDeps & {
  applyDynamicVisualizationStateSafely: (args: ApplyDynamicVisualizationStateArgs) => string | undefined;
  queueNextFrame: () => void;
  sampleFluxForPlot: SampleFluxForPlot;
  setRunning: (next: boolean) => void;
};

export type PlotModes = {
  plotMode: string;
  trackingMode: string;
};

export type StepAttempt = { ok: true; step: SimulationFrame } | { ok: false; errorMessage: string };

export type FrameSampleResult = {
  fluxForPlot: number;
  shouldSample: boolean;
};
