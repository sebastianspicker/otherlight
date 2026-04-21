import { clamp } from "../core/units";
import { ensureHiDPICanvas, type SizeInfo } from "./canvasUtil";
import {
  collectVisibleFlux,
  computeRobustRangeFromScratch,
  rangeFromStats,
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

export function drawLightCurvePlot(args: {
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
}): SizeInfo | undefined {
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
  const w = size.cssW;
  const h = size.cssH;

  if (!Number.isFinite(w) || w < 1 || !Number.isFinite(h) || h < 1) return size;

  const marginLeft = 62;
  const marginRight = 12;
  const marginTop = 28;
  const marginBottom = 26;
  const plotW = Math.max(1, w - marginLeft - marginRight);
  const plotH = Math.max(1, h - marginTop - marginBottom);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#060a10";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(238, 244, 248, 0.85)";
  ctx.font = "600 12px 'Space Grotesk', sans-serif";
  ctx.fillText(opts.title, marginLeft, 16);

  const { start, end } = visibleWindow;
  const n = Math.max(0, end - start);
  if (n < 1) {
    ctx.fillStyle = "rgba(169, 184, 198, 0.5)";
    ctx.font = "12px 'Space Grotesk', sans-serif";
    ctx.fillText("Awaiting data...", marginLeft + plotW * 0.5 - 40, marginTop + plotH * 0.5);
    return size;
  }

  const visibleStart = state.startIndex + start;
  const visibleEnd = state.startIndex + end;
  const fluxValues = state.flux;
  const timeValues = state.t;
  const fluxAt = (i: number) => fluxValues[visibleStart + i];
  const useRobustRange = opts.yScaleMode === "robust";
  const { stats: fluxStats, robustCount } = collectVisibleFlux(
    state.flux,
    visibleStart,
    visibleEnd,
    useRobustRange,
  );
  const qLo = clamp(opts.yQuantiles.lo, 0, 0.499999);
  const qHi = clamp(opts.yQuantiles.hi, qLo + 1e-6, 1);
  const manualYRange = opts.manualYRange;

  const timeDomain = visibleWindow.timeDomain;
  const haveTime = timeDomain !== null;
  const allFiniteTime = Boolean(timeDomain?.allFinite);
  const tMin = timeDomain?.tMin ?? 0;
  const tMax = timeDomain?.tMax ?? 0;
  const tSpan = Math.max(1e-12, tMax - tMin);
  const timeScale = haveTime ? plotW / tSpan : 0;
  const xTimeOffset = haveTime ? marginLeft - tMin * timeScale : 0;
  const timeInfo: TimeScaleInfo = {
    haveTime,
    allFiniteTime,
    tMin,
    tMax,
    tSpan,
    timeScale,
    xTimeOffset,
    plotW,
    marginLeft,
  };

  let range =
    manualYRange &&
    Number.isFinite(manualYRange.lo) &&
    Number.isFinite(manualYRange.hi) &&
    manualYRange.hi > manualYRange.lo
      ? { lo: manualYRange.lo, hi: manualYRange.hi }
      : useRobustRange
        ? (computeRobustRangeFromScratch(robustCount, qLo, qHi) ?? rangeFromStats(fluxStats))
        : rangeFromStats(fluxStats);

  const overlayRange = collectOverlayRange(overlaySeries, haveTime ? { tMin, tMax } : null);
  if (overlayRange) {
    if (!range) range = overlayRange;
    else {
      range = {
        lo: Math.min(range.lo, overlayRange.lo),
        hi: Math.max(range.hi, overlayRange.hi),
      };
    }
  }

  if (!range && fluxStats.finiteCount > 0 && Number.isFinite(fluxStats.constantValue)) {
    const value = fluxStats.constantValue;
    const pad = Math.max(1e-6, Math.abs(value) * 0.01, 0.01);
    range = { lo: value - pad, hi: value + pad };
  }

  if (!range && n === 1 && Number.isFinite(fluxAt(0))) {
    const value = fluxAt(0);
    const pad = Math.max(1e-6, Math.abs(value) * 0.01, 0.01);
    range = { lo: value - pad, hi: value + pad };
  }

  if (!range) return size;

  const span = Math.max(1e-10, range.hi - range.lo);
  const pad = Math.max(1e-10, span * clamp(opts.yPadFrac, 0, 1));
  const lo = range.lo - pad;
  const hi = range.hi + pad;
  const yRange = hi - lo;

  const invYSpan = 1 / (hi - lo);
  const yScale = -plotH * invYSpan;
  const yOffset = marginTop + plotH - lo * yScale;
  const yOf = (f: number) => yOffset + f * yScale;
  const indexScale = plotW / Math.max(1, n - 1);
  const xIndexOffset = marginLeft;

  drawAxes({ ctx, lo, hi, yRange, yOf, timeInfo, marginLeft, marginTop, plotW, plotH, h });

  ctx.font = "10px 'Space Mono', monospace";
  drawLegend({ ctx, overlaySeries, badges, w, marginLeft, marginTop });

  if (opts.showUnityBaseline) {
    const y1 = yOf(1);
    if (y1 >= marginTop && y1 <= marginTop + plotH) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(46, 195, 177, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.moveTo(marginLeft, y1);
      ctx.lineTo(marginLeft + plotW, y1);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(46, 195, 177, 0.55)";
      ctx.font = "9px 'Space Mono', monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("F\u2080 = 1", marginLeft + plotW - 32, y1 - 2);
    }
  }

  if (opts.showMeanLine && fluxStats.finiteCount > 0) {
    const mean = fluxStats.sum / fluxStats.finiteCount;
    const yMean = yOf(mean);
    if (yMean >= marginTop && yMean <= marginTop + plotH) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(76, 201, 240, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.moveTo(marginLeft, yMean);
      ctx.lineTo(marginLeft + plotW, yMean);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(marginLeft, marginTop, plotW, plotH);
  ctx.clip();

  drawWindowOverlays({
    ctx,
    windows: windowOverlays,
    timeInfo,
    marginLeft,
    marginTop,
    plotW,
    plotH,
  });

  for (const series of overlaySeries) {
    drawOverlaySeries({ ctx, series, yOf, timeInfo, marginLeft, plotW, marginTop, plotH });
  }

  if (n === 1) {
    const firstFlux = fluxValues[visibleStart];
    let x = xIndexOffset;
    if (haveTime) {
      const tt = timeValues[visibleStart];
      x = allFiniteTime || Number.isFinite(tt) ? xTimeOffset + tt * timeScale : xIndexOffset;
    }
    const y = yOffset + firstFlux * yScale;
    ctx.beginPath();
    ctx.fillStyle = "#4cc9f0";
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawLightCurveSeries({
      ctx,
      fluxValues,
      timeValues,
      visibleStart,
      n,
      xIndexOffset,
      indexScale,
      yOffset,
      yScale,
      xTimeOffset,
      timeScale,
      plotW,
      haveTime,
      allFiniteTime,
    });
  }

  drawMarkers({
    ctx,
    markers,
    timeInfo,
    yOf,
    marginLeft,
    marginTop,
    plotW,
    plotH,
  });

  ctx.restore();

  drawComparisonInset({
    ctx,
    inset: comparisonInset,
    marginLeft,
    marginTop,
    plotW,
    plotH,
    timeInfo,
  });

  return size;
}
