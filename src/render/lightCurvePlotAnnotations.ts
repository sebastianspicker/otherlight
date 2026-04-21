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

export function collectOverlayRange(
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
    if (
      !(
        Number.isFinite(overlay.startSec) &&
        Number.isFinite(overlay.endSec) &&
        overlay.endSec > overlay.startSec
      )
    ) {
      continue;
    }
    const x0 = Math.max(marginLeft, Math.min(marginLeft + plotW, xOfTime(timeInfo, overlay.startSec)));
    const x1 = Math.max(marginLeft, Math.min(marginLeft + plotW, xOfTime(timeInfo, overlay.endSec)));
    if (!(x1 > x0)) continue;
    ctx.save();
    ctx.fillStyle = overlay.color;
    ctx.globalAlpha = Number.isFinite(overlay.alpha)
      ? Math.min(0.75, Math.max(0.08, overlay.alpha as number))
      : 0.18;
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
