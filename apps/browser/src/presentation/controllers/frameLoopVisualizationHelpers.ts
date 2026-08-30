/**
 * Shared visualization helpers: state init, plot setters, flux/history sampling.
 */
import type { SimulationFrame } from "../../domain/simulation/frames";
import type { Canvas2DRenderer, LightCurvePlot } from "../render/canvas2d";
import type {
  LightCurveBadge,
  LightCurveComparisonInset,
  LightCurveMarker,
  LightCurveOverlayPoint,
  LightCurveOverlaySeries,
  LightCurveWindowOverlay,
} from "../render/lightCurvePlotTypes";
import type { SceneGhostGeometry } from "../render/sceneTypes";
import { scaleFluxForDisplay } from "../../application/displayFlux";
import type { NoiseState } from "../../application/noise";
import type { buildSceneDidacticOverlay } from "./visualizationDidactics";
import { pushCappedOverlayPoint } from "./visualizationDidactics";

export type FrameLoopVisualizationState = {
  t: number;
  lastFluxForPlot: number;
  displayFluxScale: number;
  fixedPlotYRange?: { lo: number; hi: number };
  fixedPlotYRangeMode?: string | null;
  noise: NoiseState;
  physicalHistory?: LightCurveOverlayPoint[];
  measuredHistory?: LightCurveOverlayPoint[];
  componentBaselineHistory?: LightCurveOverlayPoint[];
  componentTransitHistory?: LightCurveOverlayPoint[];
  componentScatterHistory?: LightCurveOverlayPoint[];
  comparisonCurveSeries?: LightCurveOverlaySeries[];
  comparisonInset?: LightCurveComparisonInset;
  comparisonGhosts?: SceneGhostGeometry[];
  comparisonBadges?: LightCurveBadge[];
};

export type VisualizationSetters = {
  setOverlaySeries: (series: LightCurveOverlaySeries[]) => void;
  setWindowOverlays: (overlays: LightCurveWindowOverlay[]) => void;
  setMarkers: (markers: LightCurveMarker[]) => void;
  setBadges: (badges: LightCurveBadge[]) => void;
  setComparisonInset: (inset?: LightCurveComparisonInset) => void;
  setSceneOverlay: (overlay: ReturnType<typeof buildSceneDidacticOverlay> | undefined) => void;
};

const HISTORY_SAMPLE_CAP = 900;

function historyArray<T>(history: T[] | undefined): T[] {
  return history ?? [];
}

function optionalComparisonValue<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function initializeHistoryState(state: FrameLoopVisualizationState): void {
  state.physicalHistory = historyArray(state.physicalHistory);
  state.measuredHistory = historyArray(state.measuredHistory);
  state.componentBaselineHistory = historyArray(state.componentBaselineHistory);
  state.componentTransitHistory = historyArray(state.componentTransitHistory);
  state.componentScatterHistory = historyArray(state.componentScatterHistory);
}

function initializeComparisonState(state: FrameLoopVisualizationState): void {
  state.comparisonCurveSeries = optionalComparisonValue(state.comparisonCurveSeries);
  state.comparisonInset = optionalComparisonValue(state.comparisonInset);
  state.comparisonGhosts = optionalComparisonValue(state.comparisonGhosts);
  state.comparisonBadges = optionalComparisonValue(state.comparisonBadges);
}

export function initializeVisualizationState(state: FrameLoopVisualizationState): void {
  initializeHistoryState(state);
  initializeComparisonState(state);
}

export function setPlotOverlaySeries(plot: LightCurvePlot, series: LightCurveOverlaySeries[]): void {
  plot.setOverlaySeries?.(series);
}

export function setPlotWindowOverlays(plot: LightCurvePlot, overlays: LightCurveWindowOverlay[]): void {
  plot.setWindowOverlays?.(overlays);
}

export function setPlotMarkers(plot: LightCurvePlot, markers: LightCurveMarker[]): void {
  plot.setMarkers?.(markers);
}

export function setPlotBadges(plot: LightCurvePlot, badges: LightCurveBadge[]): void {
  plot.setBadges?.(badges);
}

export function setPlotComparisonInset(plot: LightCurvePlot, inset?: LightCurveComparisonInset): void {
  plot.setComparisonInset?.(inset);
}

export function setSceneDidacticOverlayForRenderer(
  renderer: Canvas2DRenderer,
  overlay: ReturnType<typeof buildSceneDidacticOverlay> | undefined,
): void {
  renderer.setDidacticOverlay?.(overlay);
}

export function resolveDisplayFlux(
  candidate: number,
  fallback: number,
  lastFluxForPlot: number,
  opts?: { preferLastFinite?: boolean },
): number {
  if (Number.isFinite(candidate)) return candidate;
  if (opts?.preferLastFinite !== false && Number.isFinite(lastFluxForPlot)) return lastFluxForPlot;
  return fallback;
}

export function pushFinitePlotSample(plot: LightCurvePlot, flux: number, tSec: number): boolean {
  if (!Number.isFinite(flux)) return false;
  plot.push(flux, tSec);
  return true;
}

export function displayFluxFromStep(step: SimulationFrame, displayFluxScale: number): number {
  const displayFlux = step.debug?.displayFluxValue;
  return displayFlux !== undefined && Number.isFinite(displayFlux)
    ? displayFlux
    : scaleFluxForDisplay(step.flux.total, displayFluxScale);
}

function pushHistoryPoint(
  history: LightCurveOverlayPoint[] | undefined,
  sample: LightCurveOverlayPoint,
): void {
  pushCappedOverlayPoint(history ?? [], sample, HISTORY_SAMPLE_CAP);
}

function refractionFluxComponent(components: SimulationFrame["renderSignals"]["fluxComponents"]): number {
  return Number.isFinite(components.refraction) ? (components.refraction as number) : 0;
}

function scatterShoulderFlux(components: SimulationFrame["renderSignals"]["fluxComponents"]): number {
  return (
    components.stellarPreTransit * components.transitFactor +
    components.forwardScattering +
    components.ringScattering +
    refractionFluxComponent(components)
  );
}

function pushMeasuredHistorySample(
  state: FrameLoopVisualizationState,
  tSec: number,
  measuredFlux: number | undefined,
): void {
  if (Number.isFinite(measuredFlux)) {
    pushHistoryPoint(state.measuredHistory, { t: tSec, flux: measuredFlux as number });
  }
}

function pushComponentHistorySamples(
  state: FrameLoopVisualizationState,
  components: SimulationFrame["renderSignals"]["fluxComponents"],
  tSec: number,
): void {
  pushHistoryPoint(state.componentBaselineHistory, { t: tSec, flux: components.stellarPreTransit });
  pushHistoryPoint(state.componentTransitHistory, {
    t: tSec,
    flux: components.stellarPreTransit * components.transitFactor,
  });
  pushHistoryPoint(state.componentScatterHistory, { t: tSec, flux: scatterShoulderFlux(components) });
}

export function pushHistorySamples(
  state: FrameLoopVisualizationState,
  step: SimulationFrame,
  tSec: number,
  measuredFlux?: number,
): void {
  const physicalFlux = displayFluxFromStep(step, state.displayFluxScale);
  const components = step.renderSignals.fluxComponents;
  pushHistoryPoint(state.physicalHistory, { t: tSec, flux: physicalFlux });
  pushMeasuredHistorySample(state, tSec, measuredFlux);
  pushComponentHistorySamples(state, components, tSec);
}

export function buildVisualizationSetters(
  plot: LightCurvePlot,
  renderer: Canvas2DRenderer,
): VisualizationSetters {
  return {
    setOverlaySeries: (series) => setPlotOverlaySeries(plot, series),
    setWindowOverlays: (overlays) => setPlotWindowOverlays(plot, overlays),
    setMarkers: (markers) => setPlotMarkers(plot, markers),
    setBadges: (badges) => setPlotBadges(plot, badges),
    setComparisonInset: (inset) => setPlotComparisonInset(plot, inset),
    setSceneOverlay: (overlay) => setSceneDidacticOverlayForRenderer(renderer, overlay),
  };
}
