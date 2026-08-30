/** Renders the comparison-model inset for the light-curve plot. */

import type { TimeScaleInfo } from "./lightCurvePlotAxes";
import type { LightCurveComparisonInset } from "./lightCurvePlotTypes";

type InsetRect = { x0: number; y0: number; w: number; h: number };
type InsetFluxRange = { lo: number; hi: number };

type ComparisonInsetDrawArgs = {
  ctx: CanvasRenderingContext2D;
  inset: LightCurveComparisonInset | undefined;
  marginLeft: number;
  marginTop: number;
  plotW: number;
  plotH: number;
  timeInfo: TimeScaleInfo;
};

export function drawComparisonInset(args: ComparisonInsetDrawArgs): void {
  const { ctx, inset, timeInfo } = args;
  if (!canDrawComparisonInset(inset, timeInfo)) return;

  const rect = comparisonInsetRect(args);
  const range = collectComparisonInsetRange(inset, timeInfo);
  if (!range) return;

  ctx.save();
  drawComparisonInsetPanel(ctx, inset.title, rect);
  for (const series of inset.series) {
    drawComparisonInsetSeries({ ctx, series, rect, range, timeInfo });
  }
  ctx.restore();
}

function canDrawComparisonInset(
  inset: LightCurveComparisonInset | undefined,
  timeInfo: TimeScaleInfo,
): inset is LightCurveComparisonInset {
  return Boolean(inset && timeInfo.haveTime && inset.series.length > 0);
}

function comparisonInsetRect(args: ComparisonInsetDrawArgs): InsetRect {
  const { marginLeft, marginTop, plotW, plotH } = args;
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
): InsetFluxRange | null {
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

function isFiniteTimedFlux(sample: { t: number; flux: number }, timeInfo: TimeScaleInfo): boolean {
  return (
    Number.isFinite(sample.t) &&
    Number.isFinite(sample.flux) &&
    sample.t >= timeInfo.tMin &&
    sample.t <= timeInfo.tMax
  );
}

function paddedFluxRange(lo: number, hi: number): InsetFluxRange {
  const span = Math.max(1e-8, hi - lo);
  const pad = span * 0.15;
  return { lo: lo - pad, hi: hi + pad };
}

function drawComparisonInsetPanel(ctx: CanvasRenderingContext2D, title: string, rect: InsetRect): void {
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
  rect: InsetRect;
  range: InsetFluxRange;
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
  rect: InsetRect;
  range: InsetFluxRange;
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
  rect: InsetRect,
  range: InsetFluxRange,
  timeInfo: TimeScaleInfo,
): { x: number; y: number } {
  return {
    x: rect.x0 + ((sample.t - timeInfo.tMin) / Math.max(1e-12, timeInfo.tSpan)) * rect.w,
    y: rect.y0 + rect.h - ((sample.flux - range.lo) / Math.max(1e-12, range.hi - range.lo)) * rect.h,
  };
}
