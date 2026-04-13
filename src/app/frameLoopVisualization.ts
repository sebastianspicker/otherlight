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

export function initializeVisualizationState(state: FrameLoopVisualizationState): void {
  state.physicalHistory ??= [];
  state.measuredHistory ??= [];
  state.componentBaselineHistory ??= [];
  state.componentTransitHistory ??= [];
  state.componentScatterHistory ??= [];
  state.comparisonCurveSeries ??= undefined;
  state.comparisonInset ??= undefined;
  state.comparisonGhosts ??= undefined;
  state.comparisonBadges ??= undefined;
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

export function pushHistorySamples(
  state: FrameLoopVisualizationState,
  step: SimulationStepV3,
  tSec: number,
  measuredFlux?: number,
): void {
  const physicalFlux = displayFluxFromStep(step, state.displayFluxScale);
  const components = step.renderSignals.fluxComponents;
  pushCappedOverlayPoint(state.physicalHistory ?? [], { t: tSec, flux: physicalFlux }, 900);
  if (Number.isFinite(measuredFlux)) {
    pushCappedOverlayPoint(state.measuredHistory ?? [], { t: tSec, flux: measuredFlux as number }, 900);
  }
  pushCappedOverlayPoint(
    state.componentBaselineHistory ?? [],
    { t: tSec, flux: components.stellarPreTransit },
    900,
  );
  pushCappedOverlayPoint(
    state.componentTransitHistory ?? [],
    { t: tSec, flux: components.stellarPreTransit * components.transitFactor },
    900,
  );
  pushCappedOverlayPoint(
    state.componentScatterHistory ?? [],
    {
      t: tSec,
      flux:
        components.stellarPreTransit * components.transitFactor +
        components.forwardScattering +
        components.ringScattering +
        (Number.isFinite(components.refraction) ? (components.refraction as number) : 0),
    },
    900,
  );
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
  const overlaySeries: LightCurveOverlaySeries[] = [];

  if (plotMode === "measured" && physicalHistory.length > 0) {
    overlaySeries.push({
      id: "physical-truth",
      label: "physical truth",
      color: "#4cc9f0",
      style: "dashed",
      alpha: 0.85,
      samples: [...physicalHistory],
    });
  } else if (plotMode !== "measured" && measuredHistory.length > 0) {
    overlaySeries.push({
      id: "measured-trace",
      label: "measured trace",
      color: "#ffb703",
      style: "dashed",
      alpha: 0.8,
      samples: [...measuredHistory],
    });
  }

  if ((state.componentBaselineHistory?.length ?? 0) > 1) {
    overlaySeries.push(
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
    );
  }

  overlaySeries.push(...buildNoiseEnvelopeSeries(measuredHistory, estimateMeasurementSigma(params, state.t)));
  if (state.comparisonCurveSeries?.length) overlaySeries.push(...state.comparisonCurveSeries);

  const range =
    physicalHistory.length > 1
      ? { startSec: physicalHistory[0].t, endSec: physicalHistory[physicalHistory.length - 1].t }
      : undefined;
  const bandVariants = range ? buildBandVariantSystems(params) : [];
  if (range && bandVariants.length > 1) {
    const sampleCount = Math.min(96, Math.max(24, physicalHistory.length));
    const spanSec = Math.max(1, range.endSec - range.startSec);
    const times = Array.from(
      { length: sampleCount },
      (_, index) => range.startSec + (index / Math.max(1, sampleCount - 1)) * spanSec,
    );
    overlaySeries.push(...sampleBandOverlaySeries({ variants: bandVariants, times }));
  }

  const badges = [...buildMeasurementBadges(params, step, state.t), ...(state.comparisonBadges ?? [])];
  if (range && bandVariants.length > 1 && !badges.some((badge) => badge.label === "chromatic lane")) {
    badges.push({ label: "chromatic lane", color: "#ffb703" });
  }

  setters.setOverlaySeries(overlaySeries);
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
      ghosts: [...(state.comparisonGhosts ?? []), ...buildEpochGhosts(simulation, params, state.t)],
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
  const durationSec = Math.max(
    finitePositive(timing?.planetTransitDurationSec) ?? 0,
    finitePositive(timing?.moonTransitDurationSec) ?? 0,
  );
  const eventExtentSec = Math.max(
    Math.abs(timing?.planetIngressSec ?? 0),
    Math.abs(timing?.planetEgressSec ?? 0),
    Math.abs(timing?.moonIngressSec ?? 0),
    Math.abs(timing?.moonEgressSec ?? 0),
  );
  const cadenceSec = finitePositive(params.star.photometry?.cadenceSec) ?? 60;
  const halfWindowSec = Math.max(
    FIXED_PLOT_MIN_HALF_WINDOW_SEC,
    cadenceSec * 256,
    durationSec * 6,
    eventExtentSec + durationSec * 2,
  );
  return { startSec: -halfWindowSec, endSec: halfWindowSec };
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
