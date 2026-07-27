/**
 * Dynamic (scrolling) light-curve overlays, badges, ghosts, and scene didactics.
 */
import type { SystemParams } from "../core/types";
import { resolveOrbitElements } from "../sim/orbits";
import type { SimulationStepV3 } from "../sim/v3";
import type { Canvas2DRenderer, LightCurvePlot } from "../render/canvas2d";
import type {
  LightCurveBadge,
  LightCurveOverlayPoint,
  LightCurveOverlaySeries,
} from "../render/lightCurvePlotTypes";
import type { SceneGhostGeometry } from "../render/sceneTypes";
import { getInstrumentCfgFromPhotometry } from "./noise";
import type { AppSimulationRuntime } from "./v4Runtime";
import {
  buildBandVariantSystems,
  buildGapWindowOverlays,
  buildLightCurveMarkers,
  buildMeasurementBadges,
  buildSceneDidacticOverlay,
  createGhostGeometry,
  estimateMeasurementSigma,
  sampleBandOverlaySeries,
} from "./visualizationDidactics";
import { finitePositive } from "./frameLoopFallback";
import { buildVisualizationSetters, type FrameLoopVisualizationState } from "./frameLoopVisualizationHelpers";

type DynamicBandOverlayResult = {
  series: LightCurveOverlaySeries[];
  hasChromaticLane: boolean;
};

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

export type ApplyDynamicVisualizationStateArgs = {
  simulation: AppSimulationRuntime;
  params: SystemParams;
  step: SimulationStepV3;
  plotMode: string;
  state: FrameLoopVisualizationState;
  plot: LightCurvePlot;
  renderer: Canvas2DRenderer;
};

export function applyDynamicVisualizationState(args: ApplyDynamicVisualizationStateArgs): void {
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
