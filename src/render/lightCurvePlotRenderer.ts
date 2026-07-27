/**
 * Owns light Curve Plot Renderer support within the render layer. Keeps visual projection and drawing concerns out of simulation state.
 */
import { clamp } from "../core/units";
import { ensureHiDPICanvas, type SizeInfo } from "./canvasUtil";
import {
  collectVisibleFlux,
  computeRobustRangeFromScratch,
  rangeFromStats,
  type VisibleFluxStats,
  type VisibleWindow,
} from "./lightCurvePlotMath";
import { drawLightCurveSeries } from "./lightCurvePlotSeries";
import type {
  LightCurveBadge,
  LightCurveComparisonInset,
  LightCurveHistoryState,
  LightCurveMarker,
  LightCurveOverlaySeries,
  LightCurveWindowOverlay,
  ResolvedLightCurvePlotOptions,
} from "./lightCurvePlotTypes";
import { drawAxes, type TimeScaleInfo } from "./lightCurvePlotAxes";
import {
  collectOverlayRange,
  drawComparisonInset,
  drawLegend,
  drawMarkers,
  drawOverlaySeries,
  drawWindowOverlays,
} from "./lightCurvePlotAnnotations";

type DrawLightCurvePlotArgs = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  size?: SizeInfo;
  state: LightCurveHistoryState;
  opts: ResolvedLightCurvePlotOptions;
  visibleWindow: VisibleWindow;
  overlaySeries?: LightCurveOverlaySeries[];
  markers?: LightCurveMarker[];
  windowOverlays?: LightCurveWindowOverlay[];
  badges?: LightCurveBadge[];
  comparisonInset?: LightCurveComparisonInset;
};

type PlotLayout = {
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

type PlotScale = {
  lo: number;
  hi: number;
  yRange: number;
  yScale: number;
  yOffset: number;
  indexScale: number;
  xIndexOffset: number;
  yOf: (flux: number) => number;
};

type LightCurveRenderState = {
  visibleStart: number;
  sampleCount: number;
  fluxValues: number[];
  timeValues: number[];
  fluxStats: VisibleFluxStats;
  timeInfo: TimeScaleInfo;
  scale: PlotScale;
};

export function drawLightCurvePlot(args: DrawLightCurvePlotArgs): SizeInfo | undefined {
  const {
    canvas,
    ctx,
    state,
    opts,
    visibleWindow,
    overlaySeries = [],
    markers = [],
    windowOverlays = [],
    badges = [],
    comparisonInset,
  } = args;
  const size = ensureHiDPICanvas(canvas, ctx, args.size);
  const layout = resolvePlotLayout(size);

  if (!isDrawableLayout(layout)) return size;

  drawPlotBackground(ctx, layout, opts.title);

  if (visibleSampleCount(visibleWindow) < 1) {
    drawAwaitingData(ctx, layout);
    return size;
  }

  const renderState = resolveLightCurveRenderState({
    state,
    opts,
    visibleWindow,
    overlaySeries,
    layout,
  });
  if (!renderState) return size;

  drawPlotFrame({ ctx, layout, renderState, opts, overlaySeries, badges });
  drawClippedPlotContent({
    ctx,
    layout,
    renderState,
    overlaySeries,
    windowOverlays,
    markers,
  });
  drawComparisonInset({
    ctx,
    inset: comparisonInset,
    marginLeft: layout.marginLeft,
    marginTop: layout.marginTop,
    plotW: layout.plotW,
    plotH: layout.plotH,
    timeInfo: renderState.timeInfo,
  });

  return size;
}

function resolvePlotLayout(size: SizeInfo): PlotLayout {
  const marginLeft = 62;
  const marginRight = 12;
  const marginTop = 28;
  const marginBottom = 26;
  return {
    w: size.cssW,
    h: size.cssH,
    marginLeft,
    marginTop,
    plotW: Math.max(1, size.cssW - marginLeft - marginRight),
    plotH: Math.max(1, size.cssH - marginTop - marginBottom),
  };
}

function isDrawableLayout(layout: PlotLayout): boolean {
  return Number.isFinite(layout.w) && layout.w >= 1 && Number.isFinite(layout.h) && layout.h >= 1;
}

function drawPlotBackground(ctx: CanvasRenderingContext2D, layout: PlotLayout, title: string): void {
  ctx.clearRect(0, 0, layout.w, layout.h);
  ctx.fillStyle = "#060a10";
  ctx.fillRect(0, 0, layout.w, layout.h);

  ctx.fillStyle = "rgba(238, 244, 248, 0.85)";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.fillText(title, layout.marginLeft, 16);
}

function visibleSampleCount(visibleWindow: VisibleWindow): number {
  return Math.max(0, visibleWindow.end - visibleWindow.start);
}

function drawAwaitingData(ctx: CanvasRenderingContext2D, layout: PlotLayout): void {
  ctx.fillStyle = "rgba(169, 184, 198, 0.5)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(
    "Awaiting data...",
    layout.marginLeft + layout.plotW * 0.5 - 40,
    layout.marginTop + layout.plotH * 0.5,
  );
}

function resolveLightCurveRenderState(args: {
  state: LightCurveHistoryState;
  opts: ResolvedLightCurvePlotOptions;
  visibleWindow: VisibleWindow;
  overlaySeries: LightCurveOverlaySeries[];
  layout: PlotLayout;
}): LightCurveRenderState | null {
  const { state, opts, visibleWindow, overlaySeries, layout } = args;
  const sampleCount = visibleSampleCount(visibleWindow);
  const visibleStart = state.startIndex + visibleWindow.start;
  const visibleEnd = state.startIndex + visibleWindow.end;
  const timeInfo = resolveTimeInfo(visibleWindow, layout);
  const { range, fluxStats } = resolveFluxRange({
    state,
    opts,
    overlaySeries,
    timeInfo,
    visibleStart,
    visibleEnd,
    sampleCount,
  });
  if (!range) return null;

  return {
    visibleStart,
    sampleCount,
    fluxValues: state.flux,
    timeValues: state.t,
    fluxStats,
    timeInfo,
    scale: resolvePlotScale(range, opts, layout, sampleCount),
  };
}

function resolveTimeInfo(visibleWindow: VisibleWindow, layout: PlotLayout): TimeScaleInfo {
  const timeDomain = visibleWindow.timeDomain;
  if (!timeDomain) {
    return {
      haveTime: false,
      allFiniteTime: false,
      tMin: 0,
      tMax: 0,
      tSpan: 1e-12,
      timeScale: 0,
      xTimeOffset: 0,
      plotW: layout.plotW,
      marginLeft: layout.marginLeft,
    };
  }

  const tSpan = Math.max(1e-12, timeDomain.tMax - timeDomain.tMin);
  const timeScale = layout.plotW / tSpan;
  return {
    haveTime: true,
    allFiniteTime: timeDomain.allFinite,
    tMin: timeDomain.tMin,
    tMax: timeDomain.tMax,
    tSpan,
    timeScale,
    xTimeOffset: layout.marginLeft - timeDomain.tMin * timeScale,
    plotW: layout.plotW,
    marginLeft: layout.marginLeft,
  };
}

function resolveFluxRange(args: {
  state: LightCurveHistoryState;
  opts: ResolvedLightCurvePlotOptions;
  overlaySeries: LightCurveOverlaySeries[];
  timeInfo: TimeScaleInfo;
  visibleStart: number;
  visibleEnd: number;
  sampleCount: number;
}): { range: FluxRange | null; fluxStats: VisibleFluxStats } {
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
}

function resolveInitialFluxRange(
  opts: ResolvedLightCurvePlotOptions,
  fluxStats: VisibleFluxStats,
  robustCount: number,
): FluxRange | null {
  if (isValidManualRange(opts.manualYRange)) {
    return { lo: opts.manualYRange.lo, hi: opts.manualYRange.hi };
  }

  if (opts.yScaleMode !== "robust") return rangeFromStats(fluxStats);

  const qLo = clamp(opts.yQuantiles.lo, 0, 0.499999);
  const qHi = clamp(opts.yQuantiles.hi, qLo + 1e-6, 1);
  const robustRange = computeRobustRangeFromScratch(robustCount, qLo, qHi);
  if (robustRange) return robustRange;
  return rangeFromStats(fluxStats);
}

function isValidManualRange(range: ResolvedLightCurvePlotOptions["manualYRange"]): range is FluxRange {
  if (!range) return false;
  return Number.isFinite(range.lo) && Number.isFinite(range.hi) && range.hi > range.lo;
}

function mergeOverlayRange(
  range: FluxRange | null,
  overlaySeries: LightCurveOverlaySeries[],
  timeInfo: TimeScaleInfo,
): FluxRange | null {
  const overlayWindow = timeInfo.haveTime ? { tMin: timeInfo.tMin, tMax: timeInfo.tMax } : null;
  const overlayRange = collectOverlayRange(overlaySeries, overlayWindow);
  if (!overlayRange) return range;
  if (!range) return overlayRange;
  return {
    lo: Math.min(range.lo, overlayRange.lo),
    hi: Math.max(range.hi, overlayRange.hi),
  };
}

function rangeWithFallback(
  range: FluxRange | null,
  fluxStats: VisibleFluxStats,
  firstVisibleFlux: number,
  sampleCount: number,
): FluxRange | null {
  if (range) return range;
  const constantRange = constantFluxRange(fluxStats);
  if (constantRange) return constantRange;
  return singleSampleRange(firstVisibleFlux, sampleCount);
}

function constantFluxRange(fluxStats: VisibleFluxStats): FluxRange | null {
  if (fluxStats.finiteCount < 1) return null;
  if (!Number.isFinite(fluxStats.constantValue)) return null;
  return paddedValueRange(fluxStats.constantValue);
}

function singleSampleRange(firstVisibleFlux: number, sampleCount: number): FluxRange | null {
  if (sampleCount !== 1) return null;
  if (!Number.isFinite(firstVisibleFlux)) return null;
  return paddedValueRange(firstVisibleFlux);
}

function paddedValueRange(value: number): FluxRange {
  const pad = Math.max(1e-6, Math.abs(value) * 0.01, 0.01);
  return { lo: value - pad, hi: value + pad };
}

function resolvePlotScale(
  range: FluxRange,
  opts: ResolvedLightCurvePlotOptions,
  layout: PlotLayout,
  sampleCount: number,
): PlotScale {
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
}

const drawPlotFrame = (args: {
  ctx: CanvasRenderingContext2D;
  layout: PlotLayout;
  renderState: LightCurveRenderState;
  opts: ResolvedLightCurvePlotOptions;
  overlaySeries: LightCurveOverlaySeries[];
  badges: LightCurveBadge[];
}): void => {
  const { ctx, layout, renderState, opts, overlaySeries, badges } = args;
  const { scale, timeInfo, fluxStats } = renderState;
  drawAxes({
    ctx,
    lo: scale.lo,
    hi: scale.hi,
    yRange: scale.yRange,
    yOf: scale.yOf,
    timeInfo,
    marginLeft: layout.marginLeft,
    marginTop: layout.marginTop,
    plotW: layout.plotW,
    plotH: layout.plotH,
    h: layout.h,
  });

  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
  drawLegend({
    ctx,
    overlaySeries,
    badges,
    w: layout.w,
    marginLeft: layout.marginLeft,
    marginTop: layout.marginTop,
  });
  drawReferenceLines(ctx, layout, scale, opts, fluxStats);
};

const drawReferenceLines = (
  ctx: CanvasRenderingContext2D,
  layout: PlotLayout,
  scale: PlotScale,
  opts: ResolvedLightCurvePlotOptions,
  fluxStats: VisibleFluxStats,
): void => {
  drawUnityBaseline(ctx, layout, scale, opts.showUnityBaseline);
  drawMeanLine(ctx, layout, scale, fluxStats, opts.showMeanLine);
};

const drawUnityBaseline = (
  ctx: CanvasRenderingContext2D,
  layout: PlotLayout,
  scale: PlotScale,
  enabled: boolean,
): void => {
  if (!enabled) return;
  const y1 = scale.yOf(1);
  if (!isYInPlot(y1, layout)) return;

  drawHorizontalGuide(ctx, layout, y1, "rgba(46, 195, 177, 0.35)", [6, 4]);
  ctx.fillStyle = "rgba(46, 195, 177, 0.55)";
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("F\u2080 = 1", layout.marginLeft + layout.plotW - 32, y1 - 2);
};

const drawMeanLine = (
  ctx: CanvasRenderingContext2D,
  layout: PlotLayout,
  scale: PlotScale,
  fluxStats: VisibleFluxStats,
  enabled: boolean,
): void => {
  if (!enabled || fluxStats.finiteCount === 0) return;
  const yMean = scale.yOf(fluxStats.sum / fluxStats.finiteCount);
  if (!isYInPlot(yMean, layout)) return;
  drawHorizontalGuide(ctx, layout, yMean, "rgba(76, 201, 240, 0.4)", [3, 3]);
};

const isYInPlot = (y: number, layout: PlotLayout): boolean => {
  return y >= layout.marginTop && y <= layout.marginTop + layout.plotH;
};

const drawHorizontalGuide = (
  ctx: CanvasRenderingContext2D,
  layout: PlotLayout,
  y: number,
  strokeStyle: string,
  dash: number[],
): void => {
  ctx.beginPath();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1;
  ctx.setLineDash(dash);
  ctx.moveTo(layout.marginLeft, y);
  ctx.lineTo(layout.marginLeft + layout.plotW, y);
  ctx.stroke();
  ctx.setLineDash([]);
};

const drawClippedPlotContent = (args: {
  ctx: CanvasRenderingContext2D;
  layout: PlotLayout;
  renderState: LightCurveRenderState;
  overlaySeries: LightCurveOverlaySeries[];
  windowOverlays: LightCurveWindowOverlay[];
  markers: LightCurveMarker[];
}): void => {
  const { ctx, layout, renderState, overlaySeries, windowOverlays, markers } = args;
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.marginLeft, layout.marginTop, layout.plotW, layout.plotH);
  ctx.clip();

  drawWindowOverlays({
    ctx,
    windows: windowOverlays,
    timeInfo: renderState.timeInfo,
    marginLeft: layout.marginLeft,
    marginTop: layout.marginTop,
    plotW: layout.plotW,
    plotH: layout.plotH,
  });
  drawOverlaySeriesSet(ctx, layout, renderState, overlaySeries);
  drawPrimarySeries(ctx, layout, renderState);
  drawPlotMarkers(ctx, layout, renderState, markers);

  ctx.restore();
};

const drawOverlaySeriesSet = (
  ctx: CanvasRenderingContext2D,
  layout: PlotLayout,
  renderState: LightCurveRenderState,
  overlaySeries: LightCurveOverlaySeries[],
): void => {
  for (const series of overlaySeries) {
    drawOverlaySeries({
      ctx,
      series,
      yOf: renderState.scale.yOf,
      timeInfo: renderState.timeInfo,
      marginLeft: layout.marginLeft,
      plotW: layout.plotW,
      marginTop: layout.marginTop,
      plotH: layout.plotH,
    });
  }
};

const drawPrimarySeries = (
  ctx: CanvasRenderingContext2D,
  layout: PlotLayout,
  renderState: LightCurveRenderState,
): void => {
  if (renderState.sampleCount === 1) {
    drawSingleSample(ctx, renderState);
    return;
  }

  drawLightCurveSeries({
    ctx,
    fluxValues: renderState.fluxValues,
    timeValues: renderState.timeValues,
    visibleStart: renderState.visibleStart,
    n: renderState.sampleCount,
    xIndexOffset: renderState.scale.xIndexOffset,
    indexScale: renderState.scale.indexScale,
    yOffset: renderState.scale.yOffset,
    yScale: renderState.scale.yScale,
    xTimeOffset: renderState.timeInfo.xTimeOffset,
    timeScale: renderState.timeInfo.timeScale,
    plotW: layout.plotW,
    haveTime: renderState.timeInfo.haveTime,
    allFiniteTime: renderState.timeInfo.allFiniteTime,
  });
};

const drawSingleSample = (ctx: CanvasRenderingContext2D, renderState: LightCurveRenderState): void => {
  const firstFlux = renderState.fluxValues[renderState.visibleStart];
  const x = singleSampleX(renderState);
  const y = renderState.scale.yOffset + firstFlux * renderState.scale.yScale;
  ctx.beginPath();
  ctx.fillStyle = "#4cc9f0";
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
};

const singleSampleX = (renderState: LightCurveRenderState): number => {
  const { timeInfo, timeValues, visibleStart, scale } = renderState;
  if (!timeInfo.haveTime) return scale.xIndexOffset;
  const sampleTime = timeValues[visibleStart];
  if (!timeInfo.allFiniteTime && !Number.isFinite(sampleTime)) return scale.xIndexOffset;
  return timeInfo.xTimeOffset + sampleTime * timeInfo.timeScale;
};

const drawPlotMarkers = (
  ctx: CanvasRenderingContext2D,
  layout: PlotLayout,
  renderState: LightCurveRenderState,
  markers: LightCurveMarker[],
): void => {
  drawMarkers({
    ctx,
    markers,
    timeInfo: renderState.timeInfo,
    yOf: renderState.scale.yOf,
    marginLeft: layout.marginLeft,
    marginTop: layout.marginTop,
    plotW: layout.plotW,
    plotH: layout.plotH,
  });
};
