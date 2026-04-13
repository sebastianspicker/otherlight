import { clamp } from "../core/units";
import { ensureHiDPICanvas, type SizeInfo } from "./canvasUtil";
import {
  collectVisibleFlux,
  computeRobustRangeFromScratch,
  rangeFromStats,
  type VisibleWindow,
} from "./lightCurvePlotMath";
import { computeTickLayout, drawLightCurveSeries, formatTickValue } from "./lightCurvePlotSeries";
import type {
  LightCurveBadge,
  LightCurveComparisonInset,
  LightCurveHistoryState,
  LightCurveMarker,
  LightCurveOverlaySeries,
  LightCurveWindowOverlay,
  ResolvedLightCurvePlotOptions,
} from "./lightCurvePlotTypes";

type TimeScaleInfo = {
  haveTime: boolean;
  allFiniteTime: boolean;
  tMin: number;
  tMax: number;
  tSpan: number;
  timeScale: number;
  xTimeOffset: number;
  plotW: number;
  marginLeft: number;
};

function drawOverlaySeries(args: {
  ctx: CanvasRenderingContext2D;
  series: LightCurveOverlaySeries;
  yOf: (flux: number) => number;
  timeInfo: TimeScaleInfo;
  marginLeft: number;
  plotW: number;
  marginTop: number;
  plotH: number;
}): void {
  const { ctx, series, yOf, timeInfo, marginLeft, plotW, marginTop, plotH } = args;
  if (!Array.isArray(series.samples) || series.samples.length === 0 || !timeInfo.haveTime) return;

  let started = false;
  ctx.save();
  ctx.strokeStyle = series.color;
  ctx.globalAlpha = Number.isFinite(series.alpha) ? Math.min(1, Math.max(0.1, series.alpha as number)) : 0.9;
  ctx.lineWidth = Number.isFinite(series.width) ? Math.max(0.75, series.width as number) : 1.3;
  if (series.style === "dashed") ctx.setLineDash([7, 4]);
  else if (series.style === "dotted") ctx.setLineDash([2, 5]);
  ctx.beginPath();

  for (const sample of series.samples) {
    if (!(Number.isFinite(sample.t) && Number.isFinite(sample.flux))) continue;
    if (sample.t < timeInfo.tMin || sample.t > timeInfo.tMax) continue;
    const x = timeInfo.xTimeOffset + sample.t * timeInfo.timeScale;
    if (x < marginLeft - 2 || x > marginLeft + plotW + 2) continue;
    const y = yOf(sample.flux);
    if (y < marginTop - plotH || y > marginTop + plotH * 2) {
      if (!started) continue;
    }
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }

  if (started) ctx.stroke();
  ctx.restore();
}

function collectOverlayRange(
  overlaySeries: LightCurveOverlaySeries[],
  timeDomain: { tMin: number; tMax: number } | null,
): { lo: number; hi: number } | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const series of overlaySeries) {
    if (series.includeInRange === false) continue;
    for (const sample of series.samples) {
      if (!(Number.isFinite(sample.t) && Number.isFinite(sample.flux))) continue;
      if (timeDomain && (sample.t < timeDomain.tMin || sample.t > timeDomain.tMax)) continue;
      lo = Math.min(lo, sample.flux);
      hi = Math.max(hi, sample.flux);
    }
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? { lo, hi } : null;
}

function xOfTime(timeInfo: TimeScaleInfo, tSec: number): number {
  return timeInfo.xTimeOffset + tSec * timeInfo.timeScale;
}

function drawWindowOverlays(args: {
  ctx: CanvasRenderingContext2D;
  windows: LightCurveWindowOverlay[];
  timeInfo: TimeScaleInfo;
  marginLeft: number;
  marginTop: number;
  plotW: number;
  plotH: number;
}): void {
  const { ctx, windows, timeInfo, marginLeft, marginTop, plotW, plotH } = args;
  if (!timeInfo.haveTime) return;

  for (const overlay of windows) {
    if (!(Number.isFinite(overlay.startSec) && Number.isFinite(overlay.endSec) && overlay.endSec > overlay.startSec)) {
      continue;
    }
    const x0 = Math.max(marginLeft, Math.min(marginLeft + plotW, xOfTime(timeInfo, overlay.startSec)));
    const x1 = Math.max(marginLeft, Math.min(marginLeft + plotW, xOfTime(timeInfo, overlay.endSec)));
    if (!(x1 > x0)) continue;
    ctx.save();
    ctx.fillStyle = overlay.color;
    ctx.globalAlpha = Number.isFinite(overlay.alpha) ? Math.min(0.75, Math.max(0.08, overlay.alpha as number)) : 0.18;
    ctx.fillRect(x0, marginTop, x1 - x0, plotH);
    if (overlay.label) {
      ctx.fillStyle = "rgba(225, 233, 239, 0.88)";
      ctx.globalAlpha = 1;
      ctx.font = "10px 'Space Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(overlay.label, x0 + (x1 - x0) * 0.5, marginTop + 4);
    }
    ctx.restore();
  }
}

function drawMarkers(args: {
  ctx: CanvasRenderingContext2D;
  markers: LightCurveMarker[];
  timeInfo: TimeScaleInfo;
  yOf: (flux: number) => number;
  marginLeft: number;
  marginTop: number;
  plotW: number;
  plotH: number;
}): void {
  const { ctx, markers, timeInfo, yOf, marginLeft, marginTop, plotW, plotH } = args;
  if (!timeInfo.haveTime) return;

  let topRow = 0;
  let bottomRow = 0;
  for (const marker of markers) {
    if (!Number.isFinite(marker.tSec)) continue;
    if (marker.tSec < timeInfo.tMin || marker.tSec > timeInfo.tMax) continue;
    const x = xOfTime(timeInfo, marker.tSec);
    if (x < marginLeft || x > marginLeft + plotW) continue;
    const color = marker.color ?? "rgba(255, 214, 102, 0.92)";
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = marker.emphasized ? 0.95 : 0.7;
    ctx.lineWidth = marker.emphasized ? 1.5 : 1;
    ctx.setLineDash(marker.kind === "timing" ? [4, 4] : [2, 3]);
    ctx.beginPath();
    ctx.moveTo(x, marginTop);
    ctx.lineTo(x, marginTop + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    const alignBottom = marker.align === "bottom";
    const row = alignBottom ? bottomRow++ : topRow++;
    const yLabel = alignBottom ? marginTop + plotH - 14 - row * 12 : marginTop + 6 + row * 12;
    ctx.fillStyle = "rgba(6, 10, 16, 0.84)";
    const text = marker.label;
    const width = ctx.measureText(text).width + 10;
    const textX = Math.max(marginLeft + width * 0.5, Math.min(marginLeft + plotW - width * 0.5, x));
    ctx.fillRect(textX - width * 0.5, yLabel - 1, width, 12);
    ctx.fillStyle = color;
    ctx.font = "10px 'Space Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text, textX, yLabel);

    const yTick = alignBottom ? marginTop + plotH : yOf(1);
    if (Number.isFinite(yTick)) {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, Math.min(marginTop + plotH - 3, Math.max(marginTop + 3, yTick)), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawLegend(args: {
  ctx: CanvasRenderingContext2D;
  overlaySeries: LightCurveOverlaySeries[];
  badges: LightCurveBadge[];
  w: number;
  marginLeft: number;
  marginTop: number;
}): void {
  const { ctx, overlaySeries, badges, w, marginLeft, marginTop } = args;

  let badgeX = marginLeft;
  let badgeY = marginTop - 20;
  for (const badge of badges) {
    const width = ctx.measureText(badge.label).width + 18;
    if (badgeX + width > w - 12) {
      badgeX = marginLeft;
      badgeY += 14;
    }
    ctx.save();
    ctx.fillStyle = "rgba(6, 10, 16, 0.85)";
    ctx.fillRect(badgeX, badgeY, width, 12);
    ctx.fillStyle = badge.color;
    ctx.fillRect(badgeX + 3, badgeY + 3, 6, 6);
    ctx.fillStyle = "rgba(225, 233, 239, 0.88)";
    ctx.font = "10px 'Space Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(badge.label, badgeX + 12, badgeY + 1);
    ctx.restore();
    badgeX += width + 6;
  }

  const legendSeries = overlaySeries.filter((series) => series.includeInLegend !== false);
  let legendY = marginTop + 4;
  for (const series of legendSeries) {
    const text = series.label;
    const width = ctx.measureText(text).width + 22;
    const x = w - 16 - width;
    ctx.save();
    ctx.fillStyle = "rgba(6, 10, 16, 0.76)";
    ctx.fillRect(x, legendY, width, 12);
    ctx.strokeStyle = series.color;
    ctx.lineWidth = 1.5;
    if (series.style === "dashed") ctx.setLineDash([7, 4]);
    else if (series.style === "dotted") ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(x + 4, legendY + 6);
    ctx.lineTo(x + 14, legendY + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(225, 233, 239, 0.9)";
    ctx.font = "10px 'Space Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(text, x + 18, legendY + 1);
    ctx.restore();
    legendY += 14;
  }
}

function drawComparisonInset(args: {
  ctx: CanvasRenderingContext2D;
  inset: LightCurveComparisonInset | undefined;
  marginLeft: number;
  marginTop: number;
  plotW: number;
  plotH: number;
  timeInfo: TimeScaleInfo;
}): void {
  const { ctx, inset, marginLeft, marginTop, plotW, plotH, timeInfo } = args;
  if (!inset || !timeInfo.haveTime || inset.series.length === 0) return;

  const insetW = Math.min(240, plotW * 0.36);
  const insetH = Math.min(86, plotH * 0.34);
  const x0 = marginLeft + plotW - insetW - 10;
  const y0 = marginTop + plotH - insetH - 10;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;

  for (const series of inset.series) {
    for (const sample of series.samples) {
      if (!(Number.isFinite(sample.t) && Number.isFinite(sample.flux))) continue;
      if (sample.t < timeInfo.tMin || sample.t > timeInfo.tMax) continue;
      lo = Math.min(lo, sample.flux);
      hi = Math.max(hi, sample.flux);
    }
  }
  if (!(Number.isFinite(lo) && Number.isFinite(hi))) return;
  const span = Math.max(1e-8, hi - lo);
  const pad = span * 0.15;
  const yOf = (flux: number) => y0 + insetH - ((flux - (lo - pad)) / (span + 2 * pad)) * insetH;

  ctx.save();
  ctx.fillStyle = "rgba(6, 10, 16, 0.84)";
  ctx.fillRect(x0, y0, insetW, insetH);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, insetW, insetH);
  ctx.fillStyle = "rgba(225, 233, 239, 0.88)";
  ctx.font = "10px 'Space Grotesk', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(inset.title, x0 + 6, y0 + 4);
  for (const series of inset.series) {
    ctx.save();
    ctx.strokeStyle = series.color;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    let started = false;
    for (const sample of series.samples) {
      if (!(Number.isFinite(sample.t) && Number.isFinite(sample.flux))) continue;
      if (sample.t < timeInfo.tMin || sample.t > timeInfo.tMax) continue;
      const x = x0 + ((sample.t - timeInfo.tMin) / Math.max(1e-12, timeInfo.tSpan)) * insetW;
      const y = yOf(sample.flux);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    if (started) ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

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

  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(marginLeft, marginTop, plotW, plotH);
  ctx.stroke();

  const yTickLayout = computeTickLayout(lo, hi, Math.min(6, Math.floor(plotH / 36)));
  ctx.font = "10px 'Space Mono', monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (
    let tickVal = yTickLayout?.start ?? Number.NaN, tickCount = 0;
    Number.isFinite(tickVal) && tickVal <= hi + (yTickLayout?.step ?? 0) * 0.001 && tickCount <= 8;
    tickVal += yTickLayout?.step ?? 0, tickCount++
  ) {
    const yPos = yOf(tickVal);
    if (yPos < marginTop + 2 || yPos > marginTop + plotH - 2) continue;

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.moveTo(marginLeft, yPos);
    ctx.lineTo(marginLeft + plotW, yPos);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.moveTo(marginLeft - 4, yPos);
    ctx.lineTo(marginLeft, yPos);
    ctx.stroke();

    ctx.fillStyle = "rgba(169, 184, 198, 0.9)";
    ctx.fillText(formatTickValue(tickVal, yRange), marginLeft - 6, yPos);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (haveTime) {
    const xTickLayout = computeTickLayout(tMin, tMax, Math.min(8, Math.floor(plotW / 80)));
    const tickSpan = Math.max(1e-12, tMax - tMin);
    const tickScale = plotW / tickSpan;
    const tickOffset = marginLeft - tMin * tickScale;
    for (
      let tickVal = xTickLayout?.start ?? Number.NaN, tickCount = 0;
      Number.isFinite(tickVal) && tickVal <= tMax + (xTickLayout?.step ?? 0) * 0.001 && tickCount <= 10;
      tickVal += xTickLayout?.step ?? 0, tickCount++
    ) {
      const xPos = tickOffset + tickVal * tickScale;
      if (xPos < marginLeft + 2 || xPos > marginLeft + plotW - 2) continue;

      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.moveTo(xPos, marginTop);
      ctx.lineTo(xPos, marginTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1;
      ctx.moveTo(xPos, marginTop + plotH);
      ctx.lineTo(xPos, marginTop + plotH + 4);
      ctx.stroke();

      ctx.fillStyle = "rgba(169, 184, 198, 0.9)";
      ctx.fillText(formatTickValue(tickVal, tickSpan), xPos, marginTop + plotH + 6);
    }
  }

  ctx.save();
  ctx.fillStyle = "rgba(208, 219, 229, 0.8)";
  ctx.font = "11px 'Space Grotesk', sans-serif";
  ctx.translate(12, marginTop + plotH * 0.5);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("F / F\u2080", 0, 0);
  ctx.restore();

  if (haveTime) {
    ctx.fillStyle = "rgba(208, 219, 229, 0.8)";
    ctx.font = "11px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("t [s]", marginLeft + plotW * 0.5, h - 10);
  }

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
