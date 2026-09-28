/**
 * Annotation and overlay rendering helpers for the light-curve plot.
 *
 * Exports:
 *  - `collectOverlayRange`: computes the flux extent of visible overlay series.
 *  - `drawOverlaySeries`: renders a single overlay series onto the plot.
 *  - `drawWindowOverlays`: renders shaded time-window overlays (e.g. transit windows).
 *  - `drawMarkers`: renders labelled vertical timing markers.
 *  - `drawLegend`: renders the overlay series legend and badge row.
 *  - `drawComparisonInset`: renders the small comparison-model inset panel.
 */

import { FIGURE_FONTS, figureInk, inkFor } from "../canvas/figureInk";
import type {
  LightCurveBadge,
  LightCurveOverlaySeries,
  LightCurveWindowOverlay,
} from "./lightCurvePlotTypes";
import { type TimeScaleInfo, xOfTime } from "./lightCurvePlotAxes";
export { drawComparisonInset } from "./lightCurvePlotComparisonInset";
export { drawMarkers } from "./lightCurvePlotMarkers";
export { drawOverlaySeries } from "./lightCurvePlotOverlaySeries";

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
  ctx.fillStyle = inkFor(overlay.color, "figure");
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
  ctx.fillStyle = figureInk().ink2;
  ctx.globalAlpha = 1;
  ctx.font = `11px ${FIGURE_FONTS.mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(label, x0 + (x1 - x0) * 0.5, marginTop + 4);
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
  const ink = figureInk();
  ctx.font = `11px ${FIGURE_FONTS.mono}`;

  let badgeX = marginLeft;
  let badgeY = marginTop - 20;
  for (const badge of badges) {
    const width = ctx.measureText(badge.label).width + 18;
    if (badgeX + width > w - 12) {
      badgeX = marginLeft;
      badgeY += 14;
    }
    ctx.save();
    ctx.fillStyle = ink.chip;
    ctx.fillRect(badgeX, badgeY, width, 12);
    ctx.fillStyle = inkFor(badge.color, "figure");
    ctx.fillRect(badgeX + 3, badgeY + 3, 6, 6);
    ctx.fillStyle = ink.ink2;
    ctx.font = `11px ${FIGURE_FONTS.mono}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(badge.label, badgeX + 12, badgeY + 1);
    ctx.restore();
    badgeX += width + 6;
  }

  const legendSeries = overlaySeries.filter((series) => series.includeInLegend !== false);
  const radiusLegend = legendSeries.length === 2 && legendSeries[0].id === "radius-a";
  let legendY = radiusLegend ? marginTop - 20 : marginTop + 4;
  let legendRight = w - 16;
  for (const series of radiusLegend ? [...legendSeries].reverse() : legendSeries) {
    const text = series.label;
    ctx.font = `11px ${FIGURE_FONTS.mono}`;
    const width = ctx.measureText(text).width + 26;
    const x = legendRight - width;
    ctx.save();
    ctx.fillStyle = ink.chip;
    ctx.fillRect(x, legendY, width, 12);
    ctx.strokeStyle = inkFor(series.color, "figure");
    ctx.lineWidth = series.style === "dashed" ? 1.5 : 2;
    if (series.style === "dashed") ctx.setLineDash([7, 4]);
    else if (series.style === "dotted") ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(x + 2, legendY + 6);
    ctx.lineTo(x + 18, legendY + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ink.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(text, x + 23, legendY + 1);
    ctx.restore();
    if (radiusLegend) legendRight = x - 16;
    else legendY += 14;
  }
}
