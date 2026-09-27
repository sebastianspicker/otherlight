/** Resolves visible flux ranges and canvas scales for light-curve rendering. */
import { clamp } from "../../domain/model/units";
import {
  collectVisibleFlux,
  computeRobustRangeFromScratch,
  rangeFromStats,
  type VisibleFluxStats,
} from "./lightCurvePlotMath";
import { collectOverlayRange } from "./lightCurvePlotAnnotations";
import type {
  LightCurveHistoryState,
  LightCurveOverlaySeries,
  ResolvedLightCurvePlotOptions,
} from "./lightCurvePlotTypes";
import type { TimeScaleInfo } from "./lightCurvePlotAxes";

export type PlotLayout = {
  w: number;
  h: number;
  marginLeft: number;
  marginTop: number;
  plotW: number;
  plotH: number;
};

type FluxRange = {
  lo: number;
  hi: number;
};

export type PlotScale = {
  lo: number;
  hi: number;
  yRange: number;
  yScale: number;
  yOffset: number;
  indexScale: number;
  xIndexOffset: number;
  yOf: (flux: number) => number;
};

export const resolveFluxRange = (args: {
  state: LightCurveHistoryState;
  opts: ResolvedLightCurvePlotOptions;
  overlaySeries: LightCurveOverlaySeries[];
  timeInfo: TimeScaleInfo;
  visibleStart: number;
  visibleEnd: number;
  sampleCount: number;
}): { range: FluxRange | null; fluxStats: VisibleFluxStats } => {
  const { state, opts, overlaySeries, timeInfo, visibleStart, visibleEnd, sampleCount } = args;
  const useRobustRange = opts.yScaleMode === "robust";
  const { stats: fluxStats, robustCount } = collectVisibleFlux(
    state.flux,
    visibleStart,
    visibleEnd,
    useRobustRange,
  );
  const initialRange = resolveInitialFluxRange(opts, fluxStats, robustCount);
  const rangeWithOverlay = mergeOverlayRange(initialRange, overlaySeries, timeInfo);
  return {
    range: rangeWithFallback(rangeWithOverlay, fluxStats, state.flux[visibleStart], sampleCount),
    fluxStats,
  };
};

export const resolvePlotScale = (
  range: FluxRange,
  opts: ResolvedLightCurvePlotOptions,
  layout: PlotLayout,
  sampleCount: number,
): PlotScale => {
  const span = Math.max(1e-10, range.hi - range.lo);
  const pad = Math.max(1e-10, span * clamp(opts.yPadFrac, 0, 1));
  const lo = range.lo - pad;
  const hi = range.hi + pad;
  const yScale = -layout.plotH / (hi - lo);
  const yOffset = layout.marginTop + layout.plotH - lo * yScale;
  return {
    lo,
    hi,
    yRange: hi - lo,
    yScale,
    yOffset,
    indexScale: layout.plotW / Math.max(1, sampleCount - 1),
    xIndexOffset: layout.marginLeft,
    yOf: (flux: number) => yOffset + flux * yScale,
  };
};

const resolveInitialFluxRange = (
  opts: ResolvedLightCurvePlotOptions,
  fluxStats: VisibleFluxStats,
  robustCount: number,
): FluxRange | null => {
  if (isValidManualRange(opts.manualYRange)) return { lo: opts.manualYRange.lo, hi: opts.manualYRange.hi };
  if (opts.yScaleMode !== "robust") return rangeFromStats(fluxStats);

  const qLo = clamp(opts.yQuantiles.lo, 0, 0.499999);
  const qHi = clamp(opts.yQuantiles.hi, qLo + 1e-6, 1);
  const robustRange = computeRobustRangeFromScratch(robustCount, qLo, qHi);
  return robustRange ?? rangeFromStats(fluxStats);
};

const isValidManualRange = (range: ResolvedLightCurvePlotOptions["manualYRange"]): range is FluxRange => {
  if (!range) return false;
  return Number.isFinite(range.lo) && Number.isFinite(range.hi) && range.hi > range.lo;
};

const mergeOverlayRange = (
  range: FluxRange | null,
  overlaySeries: LightCurveOverlaySeries[],
  timeInfo: TimeScaleInfo,
): FluxRange | null => {
  const overlayWindow = timeInfo.haveTime ? { tMin: timeInfo.tMin, tMax: timeInfo.tMax } : null;
  const overlayRange = collectOverlayRange(overlaySeries, overlayWindow);
  if (!overlayRange) return range;
  if (!range) return overlayRange;
  return { lo: Math.min(range.lo, overlayRange.lo), hi: Math.max(range.hi, overlayRange.hi) };
};

const rangeWithFallback = (
  range: FluxRange | null,
  fluxStats: VisibleFluxStats,
  firstVisibleFlux: number,
  sampleCount: number,
): FluxRange | null => {
  if (range) return range;
  const constantRange = constantFluxRange(fluxStats);
  return constantRange ?? singleSampleRange(firstVisibleFlux, sampleCount);
};

const constantFluxRange = (fluxStats: VisibleFluxStats): FluxRange | null => {
  if (fluxStats.finiteCount < 1 || !Number.isFinite(fluxStats.constantValue)) return null;
  return paddedValueRange(fluxStats.constantValue);
};

const singleSampleRange = (firstVisibleFlux: number, sampleCount: number): FluxRange | null => {
  if (sampleCount !== 1 || !Number.isFinite(firstVisibleFlux)) return null;
  return paddedValueRange(firstVisibleFlux);
};

const paddedValueRange = (value: number): FluxRange => {
  const pad = Math.max(1e-6, Math.abs(value) * 0.01, 0.01);
  return { lo: value - pad, hi: value + pad };
};
