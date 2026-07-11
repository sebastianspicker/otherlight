/**
 * Annotation and overlay rendering helpers for the light-curve plot.
 *
 * Exports:
 *  - `collectOverlayRange`  — computes the flux extent of visible overlay series.
 *  - `drawOverlaySeries`    — renders a single overlay series onto the plot.
 *  - `drawWindowOverlays`   — renders shaded time-window overlays (e.g. transit windows).
 *  - `drawMarkers`          — renders labelled vertical timing markers.
 *  - `drawLegend`           — renders the overlay series legend and badge row.
 *  - `drawComparisonInset`  — renders the small comparison-model inset panel.
 */

import type {
  LightCurveBadge,
  LightCurveComparisonInset,
  LightCurveMarker,
  LightCurveOverlaySeries,
  LightCurveWindowOverlay,
} from "./lightCurvePlotTypes";
import { type TimeScaleInfo, xOfTime } from "./lightCurvePlotAxes";

type FluxRange = { lo: number; hi: number };
type PlotRect = { x0: number; y0: number; w: number; h: number };

export function collectOverlayRange(
  overlaySeries: LightCurveOverlaySeries[],
  timeDomain: { tMin: number; tMax: number } | null,
): { lo: number; hi: number } | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const series of overlaySeries) {
    if (series.includeInRange === false) continue;
    for (const sample of series.samples) {
      if (!isFiniteTimedFlux(sample, timeDomain)) continue;
      lo = Math.min(lo, sample.flux);
      hi = Math.max(hi, sample.flux);
    }
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? { lo, hi } : null;
}

function isFiniteTimedFlux(
  sample: { t: number; flux: number },
  timeDomain: { tMin: number; tMax: number } | null,
): boolean {
  if (!(Number.isFinite(sample.t) && Number.isFinite(sample.flux))) return false;
  return !timeDomain || (sample.t >= timeDomain.tMin && sample.t <= timeDomain.tMax);
}

export function drawOverlaySeries(args: {
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
    const x = xOfTime(timeInfo, sample.t);
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

export function drawWindowOverlays(args: {
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
    drawWindowOverlay({ ctx, overlay, timeInfo, marginLeft, marginTop, plotW, plotH });
  }
}

function drawWindowOverlay(args: {
  ctx: CanvasRenderingContext2D;
  overlay: LightCurveWindowOverlay;
  timeInfo: TimeScaleInfo;
  marginLeft: number;
  marginTop: number;
  plotW: number;
  plotH: number;
}): void {
  const { ctx, overlay, timeInfo, marginLeft, marginTop, plotW, plotH } = args;
  if (!isValidWindowOverlay(overlay)) return;

  const x0 = clippedOverlayX(timeInfo, overlay.startSec, marginLeft, plotW);
  const x1 = clippedOverlayX(timeInfo, overlay.endSec, marginLeft, plotW);
  if (!(x1 > x0)) return;

  ctx.save();
  ctx.fillStyle = overlay.color;
  ctx.globalAlpha = windowOverlayAlpha(overlay.alpha);
  ctx.fillRect(x0, marginTop, x1 - x0, plotH);
  if (overlay.label) drawWindowOverlayLabel(ctx, overlay.label, x0, x1, marginTop);
  ctx.restore();
}

function isValidWindowOverlay(overlay: LightCurveWindowOverlay): boolean {
  return (
    Number.isFinite(overlay.startSec) && Number.isFinite(overlay.endSec) && overlay.endSec > overlay.startSec
  );
}

function clippedOverlayX(timeInfo: TimeScaleInfo, tSec: number, marginLeft: number, plotW: number): number {
  return Math.max(marginLeft, Math.min(marginLeft + plotW, xOfTime(timeInfo, tSec)));
}

function windowOverlayAlpha(alpha: number | undefined): number {
  return Number.isFinite(alpha) ? Math.min(0.75, Math.max(0.08, alpha as number)) : 0.18;
}

function drawWindowOverlayLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  x0: number,
  x1: number,
  marginTop: number,
): void {
  ctx.fillStyle = "rgba(225, 233, 239, 0.88)";
  ctx.globalAlpha = 1;
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(label, x0 + (x1 - x0) * 0.5, marginTop + 4);
}

export function drawMarkers(args: {
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
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
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

export function drawLegend(args: {
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
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
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
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(text, x + 18, legendY + 1);
    ctx.restore();
    legendY += 14;
  }
}

export function drawComparisonInset(args: {
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

  const rect = comparisonInsetRect(marginLeft, marginTop, plotW, plotH);
  const range = collectComparisonInsetRange(inset, timeInfo);
  if (!range) return;

  ctx.save();
  drawComparisonInsetPanel(ctx, inset.title, rect);
  for (const series of inset.series) {
    drawComparisonInsetSeries({ ctx, series, rect, range, timeInfo });
  }
  ctx.restore();
}

function comparisonInsetRect(marginLeft: number, marginTop: number, plotW: number, plotH: number): PlotRect {
  const w = Math.min(240, plotW * 0.36);
  const h = Math.min(86, plotH * 0.34);
  return {
    x0: marginLeft + plotW - w - 10,
    y0: marginTop + plotH - h - 10,
    w,
    h,
  };
}

function collectComparisonInsetRange(
  inset: LightCurveComparisonInset,
  timeInfo: TimeScaleInfo,
): FluxRange | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;

  for (const series of inset.series) {
    for (const sample of series.samples) {
      if (!isFiniteTimedFlux(sample, timeInfo)) continue;
      lo = Math.min(lo, sample.flux);
      hi = Math.max(hi, sample.flux);
    }
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? paddedFluxRange(lo, hi) : null;
}

function paddedFluxRange(lo: number, hi: number): FluxRange {
  const span = Math.max(1e-8, hi - lo);
  const pad = span * 0.15;
  return { lo: lo - pad, hi: hi + pad };
}

function drawComparisonInsetPanel(ctx: CanvasRenderingContext2D, title: string, rect: PlotRect): void {
  const { x0, y0, w, h } = rect;
  ctx.fillStyle = "rgba(6, 10, 16, 0.84)";
  ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, w, h);
  ctx.fillStyle = "rgba(225, 233, 239, 0.88)";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, x0 + 6, y0 + 4);
}

function drawComparisonInsetSeries(args: {
  ctx: CanvasRenderingContext2D;
  series: LightCurveComparisonInset["series"][number];
  rect: PlotRect;
  range: FluxRange;
  timeInfo: TimeScaleInfo;
}): void {
  const { ctx, series, rect, range, timeInfo } = args;
  ctx.save();
  ctx.strokeStyle = series.color;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  const started = drawComparisonInsetPath({ ctx, series, rect, range, timeInfo });
  if (started) ctx.stroke();
  ctx.restore();
}

function drawComparisonInsetPath(args: {
  ctx: CanvasRenderingContext2D;
  series: LightCurveComparisonInset["series"][number];
  rect: PlotRect;
  range: FluxRange;
  timeInfo: TimeScaleInfo;
}): boolean {
  const { ctx, series, rect, range, timeInfo } = args;
  let started = false;
  for (const sample of series.samples) {
    if (!isFiniteTimedFlux(sample, timeInfo)) continue;
    const point = comparisonInsetPoint(sample, rect, range, timeInfo);
    if (!started) {
      ctx.moveTo(point.x, point.y);
      started = true;
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }
  return started;
}

function comparisonInsetPoint(
  sample: { t: number; flux: number },
  rect: PlotRect,
  range: FluxRange,
  timeInfo: TimeScaleInfo,
): { x: number; y: number } {
  return {
    x: rect.x0 + ((sample.t - timeInfo.tMin) / Math.max(1e-12, timeInfo.tSpan)) * rect.w,
    y: rect.y0 + rect.h - ((sample.flux - range.lo) / Math.max(1e-12, range.hi - range.lo)) * rect.h,
  };
}
