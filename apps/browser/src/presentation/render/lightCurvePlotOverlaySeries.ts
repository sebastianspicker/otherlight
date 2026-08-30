/** Renders a single overlay series on the light-curve plot. */

import { type TimeScaleInfo, xOfTime } from "./lightCurvePlotAxes";
import type { LightCurveOverlaySeries } from "./lightCurvePlotTypes";

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
  if (!canDrawOverlaySeries(series, timeInfo)) return;

  ctx.save();
  configureOverlayStroke(ctx, series);
  ctx.beginPath();
  const started = drawOverlayPath({ series, yOf, timeInfo, marginLeft, plotW, marginTop, plotH, ctx });
  if (started) ctx.stroke();
  ctx.restore();
}

function canDrawOverlaySeries(series: LightCurveOverlaySeries, timeInfo: TimeScaleInfo): boolean {
  return Array.isArray(series.samples) && series.samples.length > 0 && timeInfo.haveTime;
}

function configureOverlayStroke(ctx: CanvasRenderingContext2D, series: LightCurveOverlaySeries): void {
  ctx.strokeStyle = series.color;
  ctx.globalAlpha = Number.isFinite(series.alpha) ? Math.min(1, Math.max(0.1, series.alpha as number)) : 0.9;
  ctx.lineWidth = Number.isFinite(series.width) ? Math.max(0.75, series.width as number) : 1.3;
  if (series.style === "dashed") ctx.setLineDash([7, 4]);
  else if (series.style === "dotted") ctx.setLineDash([2, 5]);
}

function drawOverlayPath(args: {
  ctx: CanvasRenderingContext2D;
  series: LightCurveOverlaySeries;
  yOf: (flux: number) => number;
  timeInfo: TimeScaleInfo;
  marginLeft: number;
  plotW: number;
  marginTop: number;
  plotH: number;
}): boolean {
  const { ctx, series, yOf, timeInfo, marginLeft, plotW, marginTop, plotH } = args;
  let started = false;
  for (const sample of series.samples) {
    const point = visibleOverlayPoint({ sample, yOf, timeInfo, marginLeft, plotW });
    if (!point || !retainsOverlayPath(point.y, started, marginTop, plotH)) continue;
    started = appendOverlayPoint(ctx, point, started);
  }
  return started;
}

function visibleOverlayPoint(args: {
  sample: { t: number; flux: number };
  yOf: (flux: number) => number;
  timeInfo: TimeScaleInfo;
  marginLeft: number;
  plotW: number;
}): { x: number; y: number } | null {
  const { sample, yOf, timeInfo, marginLeft, plotW } = args;
  if (!(Number.isFinite(sample.t) && Number.isFinite(sample.flux))) return null;
  if (sample.t < timeInfo.tMin || sample.t > timeInfo.tMax) return null;
  const x = xOfTime(timeInfo, sample.t);
  if (x < marginLeft - 2 || x > marginLeft + plotW + 2) return null;
  return { x, y: yOf(sample.flux) };
}

function retainsOverlayPath(y: number, started: boolean, marginTop: number, plotH: number): boolean {
  const isOutsideVerticalBounds = y < marginTop - plotH || y > marginTop + plotH * 2;
  return !isOutsideVerticalBounds || started;
}

function appendOverlayPoint(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  started: boolean,
): boolean {
  if (!started) ctx.moveTo(point.x, point.y);
  else ctx.lineTo(point.x, point.y);
  return true;
}
