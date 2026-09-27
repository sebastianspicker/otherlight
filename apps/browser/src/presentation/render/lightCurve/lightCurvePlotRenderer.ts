/**
 * Draws the light-curve plot.
 */
import { ensureHiDPICanvas, type SizeInfo } from "../canvas/canvasUtil";
import { FIGURE_FONTS, figureInk } from "../canvas/figureInk";
import { type VisibleFluxStats, type VisibleWindow } from "./lightCurvePlotMath";
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
  drawComparisonInset,
  drawLegend,
  drawMarkers,
  drawOverlaySeries,
  drawWindowOverlays,
} from "./lightCurvePlotAnnotations";
import { resolveFluxRange, resolvePlotScale, type PlotLayout, type PlotScale } from "./lightCurvePlotScale";

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
  const marginTop = size.cssW < 600 ? 52 : 28;
  const marginBottom = 40;
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
  const ink = figureInk();
  ctx.fillStyle = ink.paper;
  ctx.fillRect(0, 0, layout.w, layout.h);

  ctx.fillStyle = ink.ink2;
  ctx.font = `500 12px ${FIGURE_FONTS.sans}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, layout.marginLeft, 16);
}

function visibleSampleCount(visibleWindow: VisibleWindow): number {
  return Math.max(0, visibleWindow.end - visibleWindow.start);
}

function drawAwaitingData(ctx: CanvasRenderingContext2D, layout: PlotLayout): void {
  ctx.fillStyle = figureInk().ink3;
  ctx.font = `italic 14px ${FIGURE_FONTS.serif}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    "No samples yet \u2014 start the simulation or jump to a transit.",
    layout.marginLeft + layout.plotW * 0.5,
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

  const ink = figureInk();
  drawHorizontalGuide(ctx, layout, y1, ink.ink3, [1, 3]);
  ctx.fillStyle = ink.ink3;
  ctx.font = `italic 12px ${FIGURE_FONTS.serif}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText("F\u2080 = 1", layout.marginLeft + layout.plotW - 8, y1 - 3);
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
  drawHorizontalGuide(ctx, layout, yMean, figureInk().ink3, [6, 3, 1, 3]);
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
  if (overlaySeries.some((series) => series.id === "radius-a")) ctx.setLineDash([7, 4]);
  drawPrimarySeries(ctx, layout, renderState);
  ctx.setLineDash([]);
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
  ctx.fillStyle = figureInk().traceA;
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
