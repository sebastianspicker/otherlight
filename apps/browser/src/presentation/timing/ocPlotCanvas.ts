/**
 * Draws the O-C plot frame.
 */
import { FIGURE_FONTS, figureInk } from "../render/canvas/figureInk";
import type { OcBody, OcTrendMode, OcUnit } from "./ocPlotTypes";

export type OcPlotPoint = {
  x: number;
  epoch: number;
  y: number;
};

type OcPlotFit = {
  slope: number;
  intercept: number;
  rmsResidual: number;
};

type OcPlotLayout = {
  w: number;
  h: number;
  m: { l: number; r: number; t: number; b: number };
  x0: number;
  y0: number;
  pw: number;
  ph: number;
};

type OcPlotBounds = {
  xMin: number;
  xMax: number;
  yMaxAbs: number;
};

type OcPlotScales = {
  sx: (x: number) => number;
  sy: (y: number) => number;
};

type DrawOcPlotContext = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  body: OcBody;
  pointsY: OcPlotPoint[];
  fit: OcPlotFit | undefined;
  trendMode: OcTrendMode;
  scale: number;
  unit: OcUnit;
};

type DrawFitOverlayContext = {
  ctx: CanvasRenderingContext2D;
  pointsY: OcPlotPoint[];
  fit: OcPlotFit | undefined;
  trendMode: OcTrendMode;
  scale: number;
  scales: OcPlotScales;
};

export function drawOcPlotFrame(context: DrawOcPlotContext): void {
  const layout = ocPlotLayout(context.w, context.h);
  drawOcAxes(context.ctx, layout);

  if (context.pointsY.length === 0) {
    drawNoOcEvents(context.ctx, layout, context.body);
    return;
  }

  const bounds = ocPlotBounds(context.pointsY);
  const scales = ocPlotScales(layout, bounds);
  drawZeroLine(context.ctx, layout, scales);
  drawFitOverlay({ ...context, scales });
  drawOcPolyline(context.ctx, context.pointsY, scales);
  drawOcMarkers(context.ctx, context.pointsY, scales);
  drawOcLabels(context.ctx, layout, bounds, context.unit, context.trendMode);
}

function ocPlotLayout(w: number, h: number): OcPlotLayout {
  const m = { l: 46, r: 12, t: 14, b: 28 };
  return {
    w,
    h,
    m,
    x0: m.l,
    y0: h - m.b,
    pw: Math.max(1, w - m.l - m.r),
    ph: Math.max(1, h - m.t - m.b),
  };
}

function drawOcAxes(ctx: CanvasRenderingContext2D, layout: OcPlotLayout): void {
  // Same closed journal frame as the light curve.
  ctx.strokeStyle = figureInk().frame;
  ctx.lineWidth = 1;
  ctx.strokeRect(layout.x0 + 0.5, layout.m.t + 0.5, layout.pw - 1, layout.ph - 1);
}

function drawNoOcEvents(ctx: CanvasRenderingContext2D, layout: OcPlotLayout, body: OcBody): void {
  ctx.fillStyle = figureInk().ink3;
  ctx.font = `italic 13px ${FIGURE_FONTS.serif}`;
  ctx.fillText(`No ${body} O-C events`, layout.x0 + 8, layout.m.t + 16);
}

function ocPlotBounds(pointsY: OcPlotPoint[]): OcPlotBounds {
  const bounds = initialOcPlotBounds(pointsY[0]);
  for (const point of pointsY) expandOcPlotBounds(bounds, point);
  normalizeOcPlotBounds(bounds);
  return bounds;
}

function initialOcPlotBounds(point: OcPlotPoint): OcPlotBounds {
  return { xMin: point.x, xMax: point.x, yMaxAbs: Math.abs(point.y) };
}

function expandOcPlotBounds(bounds: OcPlotBounds, point: OcPlotPoint): void {
  bounds.xMin = Math.min(bounds.xMin, point.x);
  bounds.xMax = Math.max(bounds.xMax, point.x);
  bounds.yMaxAbs = Math.max(bounds.yMaxAbs, Math.abs(point.y));
}

function normalizeOcPlotBounds(bounds: OcPlotBounds): void {
  if (bounds.xMax <= bounds.xMin) bounds.xMax = bounds.xMin + 1;
  if (!(bounds.yMaxAbs > 0)) bounds.yMaxAbs = 1e-9;
  bounds.yMaxAbs *= 1.25;
}

function ocPlotScales(layout: OcPlotLayout, bounds: OcPlotBounds): OcPlotScales {
  return {
    sx: (x: number) => layout.x0 + ((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * layout.pw,
    sy: (y: number) => layout.m.t + ((bounds.yMaxAbs - y) / (2 * bounds.yMaxAbs)) * layout.ph,
  };
}

function drawFitOverlay(context: DrawFitOverlayContext): void {
  if (context.trendMode !== "fit" || !context.fit || context.pointsY.length < 2) return;
  context.ctx.save();
  context.ctx.strokeStyle = figureInk().caution;
  context.ctx.lineWidth = 1;
  context.ctx.setLineDash([5, 4]);
  context.ctx.beginPath();
  const first = context.pointsY[0];
  const last = context.pointsY[context.pointsY.length - 1];
  context.ctx.moveTo(
    context.scales.sx(first.x),
    context.scales.sy(fitYAtEpoch(context.fit, first.epoch, context.scale)),
  );
  context.ctx.lineTo(
    context.scales.sx(last.x),
    context.scales.sy(fitYAtEpoch(context.fit, last.epoch, context.scale)),
  );
  context.ctx.stroke();
  context.ctx.restore();
}

function fitYAtEpoch(fit: OcPlotFit, epoch: number, scale: number): number {
  return (fit.intercept + fit.slope * epoch) * scale;
}

function drawOcPolyline(ctx: CanvasRenderingContext2D, pointsY: OcPlotPoint[], scales: OcPlotScales): void {
  ctx.strokeStyle = figureInk().traceA;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  pointsY.forEach((p, i) => {
    const x = scales.sx(p.x);
    const y = scales.sy(p.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawOcMarkers(ctx: CanvasRenderingContext2D, pointsY: OcPlotPoint[], scales: OcPlotScales): void {
  ctx.fillStyle = figureInk().traceB;
  for (const p of pointsY) {
    ctx.beginPath();
    ctx.arc(scales.sx(p.x), scales.sy(p.y), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOcLabels(
  ctx: CanvasRenderingContext2D,
  layout: OcPlotLayout,
  bounds: OcPlotBounds,
  unit: OcUnit,
  trendMode: OcTrendMode,
): void {
  ctx.fillStyle = figureInk().ink2;
  ctx.font = `11px ${FIGURE_FONTS.mono}`;
  const label = trendMode === "detrended" ? `detrended O-C [${unitLabel(unit)}]` : `O-C [${unitLabel(unit)}]`;
  ctx.fillText(label, 8, layout.m.t + 10);
  ctx.fillText(String(bounds.xMin.toFixed(0)), layout.x0, layout.h - 8);
  const xText = String(bounds.xMax.toFixed(0));
  ctx.fillText(xText, layout.x0 + layout.pw - ctx.measureText(xText).width, layout.h - 8);
}

function unitLabel(unit: OcUnit): string {
  return unit === "ms" ? "ms" : "s";
}

/** Draws the O-C zero line. */
function drawZeroLine(ctx: CanvasRenderingContext2D, layout: OcPlotLayout, scales: OcPlotScales): void {
  const yZero = scales.sy(0);
  ctx.strokeStyle = figureInk().ink3;
  ctx.beginPath();
  ctx.moveTo(layout.x0, yZero);
  ctx.lineTo(layout.x0 + layout.pw, yZero);
  ctx.stroke();
}
