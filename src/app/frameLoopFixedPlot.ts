/**
 * Fixed-window light-curve preview rebuild and Y-range handling.
 */
import type { SystemParams } from "../core/types";
import type { SimulationStepV3 } from "../sim/v3";
import type { Canvas2DRenderer, LightCurvePlot } from "../render/canvas2d";
import type { LightCurveOverlayPoint, LightCurveOverlaySeries } from "../render/lightCurvePlotTypes";
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
  sampleBandOverlaySeries,
} from "./visualizationDidactics";
import { finitePositive, FIXED_PLOT_MIN_HALF_WINDOW_SEC, FIXED_PLOT_SAMPLE_COUNT } from "./frameLoopFallback";
import { buildEpochGhosts } from "./frameLoopDynamicVisualization";
import {
  buildVisualizationSetters,
  displayFluxFromStep,
  type FrameLoopVisualizationState,
  pushFinitePlotSample,
} from "./frameLoopVisualizationHelpers";

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
