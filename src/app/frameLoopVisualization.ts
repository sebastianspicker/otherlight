import type { SystemParams } from "../core/types";
import { resolveOrbitElements } from "../sim/orbits";
import type { SimulationStepV3 } from "../sim/v3";
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
import { scaleFluxForDisplay } from "./displayFlux";
import { createInstrumentNoiseState } from "../photometry/instrumentNoise";
import { getInstrumentCfgFromPhotometry, type NoiseState } from "./noise";
import type { AppSimulationRuntime } from "./v4Runtime";
import {
  buildBandVariantSystems,
  buildGapWindowOverlays,
  buildLightCurveMarkers,
  buildMeasurementBadges,
  buildSceneDidacticOverlay,
  componentOverlaySeriesFromSamples,
  createGhostGeometry,
  estimateMeasurementSigma,
  pushCappedOverlayPoint,
  sampleBandOverlaySeries,
} from "./visualizationDidactics";
import { finitePositive, FIXED_PLOT_MIN_HALF_WINDOW_SEC, FIXED_PLOT_SAMPLE_COUNT } from "./frameLoopFallback";

type FrameLoopVisualizationState = {
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

type VisualizationSetters = {
  setOverlaySeries: (series: LightCurveOverlaySeries[]) => void;
  setWindowOverlays: (overlays: LightCurveWindowOverlay[]) => void;
  setMarkers: (markers: LightCurveMarker[]) => void;
  setBadges: (badges: LightCurveBadge[]) => void;
  setComparisonInset: (inset?: LightCurveComparisonInset) => void;
  setSceneOverlay: (overlay: ReturnType<typeof buildSceneDidacticOverlay> | undefined) => void;
};

type DynamicBandOverlayResult = {
  series: LightCurveOverlaySeries[];
  hasChromaticLane: boolean;
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

export function displayFluxFromStep(step: SimulationStepV3, displayFluxScale: number): number {
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

function refractionFluxComponent(components: SimulationStepV3["renderSignals"]["fluxComponents"]): number {
  return Number.isFinite(components.refraction) ? (components.refraction as number) : 0;
}

function scatterShoulderFlux(components: SimulationStepV3["renderSignals"]["fluxComponents"]): number {
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
  components: SimulationStepV3["renderSignals"]["fluxComponents"],
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
  step: SimulationStepV3,
  tSec: number,
  measuredFlux?: number,
): void {
  const physicalFlux = displayFluxFromStep(step, state.displayFluxScale);
  const components = step.renderSignals.fluxComponents;
  pushHistoryPoint(state.physicalHistory, { t: tSec, flux: physicalFlux });
  pushMeasuredHistorySample(state, tSec, measuredFlux);
  pushComponentHistorySamples(state, components, tSec);
}

function shouldShowEpochGhost(params: SystemParams): boolean {
  return Boolean(
    params.dynamics?.exomoonTimingShape?.enabled ||
      params.dynamics?.nbodyPlanetMoon?.enabled ||
      params.dynamics?.relativity?.enabled ||
      params.star.photometry?.spotEvolution?.enabled ||
      params.star.photometry?.stellarSurface?.enabled,
  );
}

export function buildEpochGhosts(
  simulation: AppSimulationRuntime,
  params: SystemParams,
  tSec: number,
): SceneGhostGeometry[] {
  if (!shouldShowEpochGhost(params)) return [];
  let periodSec: number | undefined;
  try {
    periodSec = finitePositive(resolveOrbitElements(params.planet.orbit, tSec, "planet.orbit").period);
  } catch {
    periodSec = undefined;
  }
  if (!(periodSec && periodSec > 0)) return [];
  try {
    return [createGhostGeometry("next epoch", simulation.step(tSec + periodSec), "rgba(255,255,255,0.26)")];
  } catch {
    return [];
  }
}

function buildNoiseEnvelopeSeries(
  measuredHistory: LightCurveOverlayPoint[],
  sigma: number | undefined,
): LightCurveOverlaySeries[] {
  if (!(Number.isFinite(sigma) && (sigma as number) > 0 && measuredHistory.length > 0)) return [];
  const upper = measuredHistory.map((sample) => ({ t: sample.t, flux: sample.flux + (sigma as number) }));
  const lower = measuredHistory.map((sample) => ({ t: sample.t, flux: sample.flux - (sigma as number) }));
  return [
    {
      id: "noise-upper",
      label: "noise envelope",
      color: "#ffb703",
      style: "dotted",
      alpha: 0.4,
      includeInLegend: true,
      samples: upper,
    },
    {
      id: "noise-lower",
      label: "noise envelope",
      color: "#ffb703",
      style: "dotted",
      alpha: 0.4,
      includeInLegend: false,
      samples: lower,
    },
  ];
}

function buildVisualizationSetters(plot: LightCurvePlot, renderer: Canvas2DRenderer): VisualizationSetters {
  return {
    setOverlaySeries: (series) => setPlotOverlaySeries(plot, series),
    setWindowOverlays: (overlays) => setPlotWindowOverlays(plot, overlays),
    setMarkers: (markers) => setPlotMarkers(plot, markers),
    setBadges: (badges) => setPlotBadges(plot, badges),
    setComparisonInset: (inset) => setPlotComparisonInset(plot, inset),
    setSceneOverlay: (overlay) => setSceneDidacticOverlayForRenderer(renderer, overlay),
  };
}

function modeOverlaySeries(
  plotMode: string,
  physicalHistory: LightCurveOverlayPoint[],
  measuredHistory: LightCurveOverlayPoint[],
): LightCurveOverlaySeries[] {
  if (plotMode === "measured" && physicalHistory.length > 0) {
    return [
      {
        id: "physical-truth",
        label: "physical truth",
        color: "#4cc9f0",
        style: "dashed",
        alpha: 0.85,
        samples: [...physicalHistory],
      },
    ];
  }

  if (plotMode !== "measured" && measuredHistory.length > 0) {
    return [
      {
        id: "measured-trace",
        label: "measured trace",
        color: "#ffb703",
        style: "dashed",
        alpha: 0.8,
        samples: [...measuredHistory],
      },
    ];
  }

  return [];
}

function dynamicComponentSeries(state: FrameLoopVisualizationState): LightCurveOverlaySeries[] {
  if ((state.componentBaselineHistory?.length ?? 0) <= 1) return [];
  return [
    {
      id: "dynamic-stellar-baseline",
      label: "stellar baseline",
      color: "#6c757d",
      style: "dashed",
      alpha: 0.65,
      samples: [...(state.componentBaselineHistory ?? [])],
    },
    {
      id: "dynamic-transit-attenuation",
      label: "transit attenuation",
      color: "#8ecae6",
      style: "dotted",
      alpha: 0.78,
      samples: [...(state.componentTransitHistory ?? [])],
    },
    {
      id: "dynamic-scatter-shoulder",
      label: "scatter/refraction shoulder",
      color: "#ffb703",
      style: "solid",
      alpha: 0.8,
      samples: [...(state.componentScatterHistory ?? [])],
    },
  ];
}

function dynamicHistoryRange(
  physicalHistory: LightCurveOverlayPoint[],
): { startSec: number; endSec: number } | undefined {
  if (physicalHistory.length <= 1) return undefined;
  return { startSec: physicalHistory[0].t, endSec: physicalHistory[physicalHistory.length - 1].t };
}

function sampleTimesForRange(range: { startSec: number; endSec: number }, sampleCount: number): number[] {
  const spanSec = Math.max(1, range.endSec - range.startSec);
  return Array.from(
    { length: sampleCount },
    (_, index) => range.startSec + (index / Math.max(1, sampleCount - 1)) * spanSec,
  );
}

function dynamicBandOverlaySeries(
  params: SystemParams,
  range: { startSec: number; endSec: number } | undefined,
  physicalHistory: LightCurveOverlayPoint[],
): DynamicBandOverlayResult {
  if (!range) return { series: [], hasChromaticLane: false };
  const bandVariants = buildBandVariantSystems(params);
  if (bandVariants.length <= 1) return { series: [], hasChromaticLane: false };

  const sampleCount = Math.min(96, Math.max(24, physicalHistory.length));
  const times = sampleTimesForRange(range, sampleCount);
  return { series: sampleBandOverlaySeries({ variants: bandVariants, times }), hasChromaticLane: true };
}

function dynamicOverlaySeries(args: {
  params: SystemParams;
  plotMode: string;
  state: FrameLoopVisualizationState;
  physicalHistory: LightCurveOverlayPoint[];
  measuredHistory: LightCurveOverlayPoint[];
  range: { startSec: number; endSec: number } | undefined;
}): DynamicBandOverlayResult {
  const overlaySeries: LightCurveOverlaySeries[] = [
    ...modeOverlaySeries(args.plotMode, args.physicalHistory, args.measuredHistory),
    ...dynamicComponentSeries(args.state),
    ...buildNoiseEnvelopeSeries(args.measuredHistory, estimateMeasurementSigma(args.params, args.state.t)),
    ...(args.state.comparisonCurveSeries ?? []),
  ];
  const bandOverlay = dynamicBandOverlaySeries(args.params, args.range, args.physicalHistory);
  overlaySeries.push(...bandOverlay.series);
  return { series: overlaySeries, hasChromaticLane: bandOverlay.hasChromaticLane };
}

function dynamicBadges(
  params: SystemParams,
  step: SimulationStepV3,
  state: FrameLoopVisualizationState,
  hasChromaticLane: boolean,
): LightCurveBadge[] {
  const badges = [...buildMeasurementBadges(params, step, state.t), ...(state.comparisonBadges ?? [])];
  if (hasChromaticLane && !badges.some((badge) => badge.label === "chromatic lane")) {
    badges.push({ label: "chromatic lane", color: "#ffb703" });
  }
  return badges;
}

function dynamicSceneGhosts(
  simulation: AppSimulationRuntime,
  params: SystemParams,
  state: FrameLoopVisualizationState,
): SceneGhostGeometry[] {
  return [...(state.comparisonGhosts ?? []), ...buildEpochGhosts(simulation, params, state.t)];
}

export function applyDynamicVisualizationState(args: {
  simulation: AppSimulationRuntime;
  params: SystemParams;
  step: SimulationStepV3;
  plotMode: string;
  state: FrameLoopVisualizationState;
  plot: LightCurvePlot;
  renderer: Canvas2DRenderer;
}): void {
  const { simulation, params, step, plotMode, state, plot, renderer } = args;
  const setters = buildVisualizationSetters(plot, renderer);
  const physicalHistory = state.physicalHistory ?? [];
  const measuredHistory = state.measuredHistory ?? [];
  const range = dynamicHistoryRange(physicalHistory);
  const overlays = dynamicOverlaySeries({ params, plotMode, state, physicalHistory, measuredHistory, range });
  const badges = dynamicBadges(params, step, state, overlays.hasChromaticLane);

  setters.setOverlaySeries(overlays.series);
  setters.setWindowOverlays(
    buildGapWindowOverlays(getInstrumentCfgFromPhotometry(params.star.photometry)?.observer, range),
  );
  setters.setBadges(badges);
  setters.setMarkers(buildLightCurveMarkers(step));
  setters.setComparisonInset(state.comparisonInset);
  setters.setSceneOverlay(
    buildSceneDidacticOverlay({
      params,
      step,
      tSec: state.t,
      ghosts: dynamicSceneGhosts(simulation, params, state),
      extraBadges: badges,
    }),
  );
}

export function clearFixedComparisonRange(state: FrameLoopVisualizationState, plot: LightCurvePlot): void {
  state.fixedPlotYRange = undefined;
  state.fixedPlotYRangeMode = null;
  plot.setOptions({ manualYRange: undefined });
}

function deriveFixedPlotWindow(
  step0: SimulationStepV3,
  params: SystemParams,
): { startSec: number; endSec: number } {
  const timing = step0.timing;
  const durationSec = fixedPlotDurationSec(timing);
  const eventExtentSec = fixedPlotEventExtentSec(timing);
  const cadenceSec = finitePositive(params.star.photometry?.cadenceSec) ?? 60;
  const halfWindowSec = Math.max(
    FIXED_PLOT_MIN_HALF_WINDOW_SEC,
    cadenceSec * 256,
    durationSec * 6,
    eventExtentSec + durationSec * 2,
  );
  return { startSec: -halfWindowSec, endSec: halfWindowSec };
}

function finitePositiveOrZero(value: unknown): number {
  return finitePositive(value) ?? 0;
}

function finiteNumberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function fixedPlotDurationSec(timing: SimulationStepV3["timing"]): number {
  return Math.max(
    finitePositiveOrZero(timing?.planetTransitDurationSec),
    finitePositiveOrZero(timing?.moonTransitDurationSec),
  );
}

function absTimingOffsetSec(value: unknown): number {
  return Math.abs(finiteNumberOrZero(value));
}

function fixedPlotEventExtentSec(timing: SimulationStepV3["timing"]): number {
  return Math.max(
    absTimingOffsetSec(timing?.planetIngressSec),
    absTimingOffsetSec(timing?.planetEgressSec),
    absTimingOffsetSec(timing?.moonIngressSec),
    absTimingOffsetSec(timing?.moonEgressSec),
  );
}

export function rebuildFixedPlot(args: {
  simulation: AppSimulationRuntime;
  params: SystemParams;
  plotMode: string;
  state: FrameLoopVisualizationState;
  plot: LightCurvePlot;
  renderer: Canvas2DRenderer;
  sampleFluxForPlot: (
    simulation: AppSimulationRuntime,
    params: SystemParams,
    plotMode: string,
    tSec: number,
    dtSec: number,
    noiseState?: NoiseState["noiseState"],
    stepAtTime?: SimulationStepV3,
  ) => number;
  step0?: SimulationStepV3;
}): void {
  const { simulation, params, plotMode, state, plot, renderer, sampleFluxForPlot, step0 } = args;
  const setters = buildVisualizationSetters(plot, renderer);
  if (state.fixedPlotYRangeMode && state.fixedPlotYRangeMode !== plotMode) {
    clearFixedComparisonRange(state, plot);
  }

  const anchorStep = step0 ?? simulation.step(0);
  const { startSec, endSec } = deriveFixedPlotWindow(anchorStep, params);
  const sampleCount = Math.max(32, FIXED_PLOT_SAMPLE_COUNT);
  const spanSec = Math.max(1, endSec - startSec);
  const previewNoiseState = createInstrumentNoiseState(state.noise.noiseSeed);
  const previewSamples: Array<{ flux: number; tSec: number }> = [];
  const physicalPreview: LightCurveOverlayPoint[] = [];
  const measuredPreview: LightCurveOverlayPoint[] = [];
  const stepPreview: Array<{ t: number; step: SimulationStepV3 }> = [];
  const times: number[] = [];
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;

  plot.clear();
  for (let i = 0; i < sampleCount; i++) {
    const frac = sampleCount === 1 ? 0 : i / (sampleCount - 1);
    const tSec = startSec + frac * spanSec;
    const dtSec = i === 0 ? 0 : spanSec / Math.max(1, sampleCount - 1);
    const sampledStep = simulation.step(tSec);
    const physicalFlux = displayFluxFromStep(sampledStep, state.displayFluxScale);
    const measuredFlux = sampleFluxForPlot(
      simulation,
      params,
      "measured",
      tSec,
      dtSec,
      previewNoiseState,
      sampledStep,
    );
    const fluxForPlot = plotMode === "measured" ? measuredFlux : physicalFlux;
    if (Number.isFinite(fluxForPlot)) {
      lo = Math.min(lo, fluxForPlot);
      hi = Math.max(hi, fluxForPlot);
    }
    previewSamples.push({ flux: fluxForPlot, tSec });
    physicalPreview.push({ t: tSec, flux: physicalFlux });
    if (Number.isFinite(measuredFlux)) measuredPreview.push({ t: tSec, flux: measuredFlux });
    stepPreview.push({ t: tSec, step: sampledStep });
    times.push(tSec);
  }

  if (!state.fixedPlotYRange && Number.isFinite(lo) && Number.isFinite(hi)) {
    const span = Math.max(1e-6, hi - lo);
    const pad = Math.max(1e-6, span * 0.02);
    state.fixedPlotYRange = { lo: lo - pad, hi: hi + pad };
    state.fixedPlotYRangeMode = plotMode;
  }

  plot.setOptions({ manualYRange: state.fixedPlotYRange });
  for (const sample of previewSamples) pushFinitePlotSample(plot, sample.flux, sample.tSec);

  const overlaySeries: LightCurveOverlaySeries[] = [];
  overlaySeries.push(
    ...(plotMode === "measured"
      ? [
          {
            id: "physical-truth-fixed",
            label: "physical truth",
            color: "#4cc9f0",
            style: "dashed",
            alpha: 0.9,
            samples: physicalPreview,
          } satisfies LightCurveOverlaySeries,
        ]
      : measuredPreview.length > 0
        ? [
            {
              id: "measured-trace-fixed",
              label: "measured trace",
              color: "#ffb703",
              style: "dashed",
              alpha: 0.82,
              samples: measuredPreview,
            } satisfies LightCurveOverlaySeries,
          ]
        : []),
  );
  overlaySeries.push(...componentOverlaySeriesFromSamples(stepPreview));
  const bandVariants = buildBandVariantSystems(params);
  if (bandVariants.length > 1)
    overlaySeries.push(...sampleBandOverlaySeries({ variants: bandVariants, times }));
  if (state.comparisonCurveSeries?.length) overlaySeries.push(...state.comparisonCurveSeries);

  const badges = [...buildMeasurementBadges(params, anchorStep, state.t), ...(state.comparisonBadges ?? [])];
  if (bandVariants.length > 1) badges.push({ label: "chromatic lane", color: "#ffb703" });
  setters.setOverlaySeries(overlaySeries);
  setters.setWindowOverlays(
    buildGapWindowOverlays(getInstrumentCfgFromPhotometry(params.star.photometry)?.observer, {
      startSec,
      endSec,
    }),
  );
  setters.setBadges(badges);
  setters.setMarkers(buildLightCurveMarkers(anchorStep));
  setters.setComparisonInset(state.comparisonInset);
  setters.setSceneOverlay(
    buildSceneDidacticOverlay({
      params,
      step: anchorStep,
      tSec: state.t,
      ghosts: [...(state.comparisonGhosts ?? []), ...buildEpochGhosts(simulation, params, state.t)],
      extraBadges: badges,
    }),
  );
}
