import { drawOcPlotFrame, type OcPlotPoint } from "./ocPlotCanvas";
import type { TransitHistorySeries, TransitHistoryState } from "./transitHistory";

export type OcBody = "planet" | "moon";
export type OcUnit = "s" | "ms";
export type OcTrendMode = "raw" | "fit" | "detrended";
export type OcCsvOptions = { unit?: OcUnit; trendMode?: OcTrendMode };

type OcPoint = { x: number; y: number; centerSec: number };
type OcFit = NonNullable<ReturnType<typeof fitLinearEphemeris>>;
type OcPanelStats = {
  body: OcBody;
  unit: OcUnit;
  trendMode: OcTrendMode;
  n: number;
  latest: number | undefined;
  rms: number | undefined;
  lastDur: number | undefined;
  slopePerEpoch: number | undefined;
  rmsResidual: number | undefined;
  unitTxt: string;
};
type OcCsvRowContext = {
  body: OcBody;
  unit: OcUnit;
  trendMode: OcTrendMode;
  scale: number;
  fitByCenter: Map<number, number>;
};
type OcRenderOptions = {
  unit: OcUnit;
  trendMode: OcTrendMode;
  scale: number;
};
type OcCanvasMetrics = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
};

function finite(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function fmt(v: number | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toExponential(3) : "n/a";
}

function getOcSeries(state: TransitHistoryState, body: OcBody): TransitHistorySeries {
  return body === "moon" ? state.moon : state.planet;
}

function unitScale(unit: OcUnit): number {
  return unit === "ms" ? 1000 : 1;
}

function unitLabel(unit: OcUnit): string {
  return unit === "ms" ? "ms" : "s";
}

function fmtWithUnit(v: number | undefined, unit: OcUnit): string {
  const s = unitScale(unit);
  return fmt(typeof v === "number" ? v * s : undefined);
}

function collectFiniteOcPoints(series: TransitHistorySeries): OcPoint[] {
  // Use epoch index k (ordinal 0,1,2,...) for the x-coordinate of the linear fit,
  // not the absolute time.  Fitting O-C vs absolute time produces a slope whose
  // numerical value is dominated by the magnitude of t, making it meaningless.
  // The epoch number avoids this and gives a slope in seconds/epoch.
  let k = 0;
  const out: Array<{ x: number; y: number; centerSec: number }> = [];
  for (const e of series.events) {
    const oc = finite(e.ocSec);
    const center = finite(e.centerSec);
    if (oc !== undefined && center !== undefined) {
      out.push({ x: k, y: oc, centerSec: center });
      k++;
    }
  }
  return out;
}

export function fitLinearEphemeris(points: Array<{ x: number; y: number }>):
  | {
      slope: number;
      intercept: number;
      rmsResidual: number;
    }
  | undefined {
  if (points.length < 2) return undefined;
  const n = points.length;
  const xMean = points.reduce((a, p) => a + p.x, 0) / n;
  const yMean = points.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - xMean;
    sxx += dx * dx;
    sxy += dx * (p.y - yMean);
  }
  if (!(sxx > 0)) return undefined;

  const slope = sxy / sxx;
  const intercept = yMean - slope * xMean;
  let rss = 0;
  for (const p of points) {
    const r = p.y - (intercept + slope * p.x);
    rss += r * r;
  }
  return { slope, intercept, rmsResidual: Math.sqrt(rss / Math.max(1, n - 2)) };
}

export function formatOcPanelStats(
  state: TransitHistoryState,
  body: OcBody,
  opts: { unit?: OcUnit; trendMode?: OcTrendMode } = {},
): string {
  const stats = ocPanelStats(state, body, opts);
  if (stats.trendMode === "raw") return formatRawOcPanelStats(stats);
  if (stats.trendMode === "fit") return formatFitOcPanelStats(stats);
  return formatDetrendedOcPanelStats(stats);
}

function ocPanelStats(
  state: TransitHistoryState,
  body: OcBody,
  opts: { unit?: OcUnit; trendMode?: OcTrendMode },
): OcPanelStats {
  const unit = opts.unit ?? "s";
  const trendMode = opts.trendMode ?? "raw";
  const series = getOcSeries(state, body);
  const points = collectFiniteOcPoints(series);
  const fit = ocPanelFit(points, trendMode);
  const n = series.events.length;
  return {
    body,
    unit,
    trendMode,
    n,
    latest: series.latestOcSec,
    rms: series.rmsOcSec,
    lastDur: finite(series.events[n - 1]?.durationSec),
    slopePerEpoch: fit ? fit.slope : undefined,
    rmsResidual: fit ? fit.rmsResidual : undefined,
    unitTxt: unitLabel(unit),
  };
}

function ocPanelFit(points: OcPoint[], trendMode: OcTrendMode): OcFit | undefined {
  return trendMode === "raw" ? undefined : fitLinearEphemeris(points);
}

function formatRawOcPanelStats(stats: OcPanelStats): string {
  return `${stats.body} events=${stats.n} latest=${fmtWithUnit(stats.latest, stats.unit)} rms=${fmtWithUnit(stats.rms, stats.unit)} dur=${fmt(stats.lastDur)} s [${stats.unitTxt}]`;
}

function formatFitOcPanelStats(stats: OcPanelStats): string {
  return `${stats.body} events=${stats.n} latest=${fmtWithUnit(stats.latest, stats.unit)} rms=${fmtWithUnit(stats.rms, stats.unit)} slope=${fmtWithUnit(stats.slopePerEpoch, stats.unit)}/epoch`;
}

function formatDetrendedOcPanelStats(stats: OcPanelStats): string {
  return `${stats.body} events=${stats.n} detrendedRms=${fmtWithUnit(stats.rmsResidual, stats.unit)} slope=${fmtWithUnit(stats.slopePerEpoch, stats.unit)}/epoch`;
}

export function formatOcFitSummary(
  state: TransitHistoryState,
  body: OcBody,
  opts: { unit?: OcUnit } = {},
): string {
  const unit = opts.unit ?? "s";
  const points = collectFiniteOcPoints(getOcSeries(state, body));
  const fit = fitLinearEphemeris(points);
  if (!fit) return `${body} fit: n/a`;
  const slopePerEpoch = fit.slope;
  return `${body} fit slope=${fmtWithUnit(slopePerEpoch, unit)}/epoch intercept=${fmtWithUnit(fit.intercept, unit)} rms=${fmtWithUnit(fit.rmsResidual, unit)}`;
}

export function buildOcCsv(state: TransitHistoryState, body: OcBody, opts: OcCsvOptions = {}): string {
  const unit = opts.unit ?? "s";
  const trendMode = opts.trendMode ?? "raw";
  const scale = unitScale(unit);
  const series = getOcSeries(state, body);
  const points = collectFiniteOcPoints(series);
  const fit = fitLinearEphemeris(points);
  const fitByCenter = fitValuesByCenter(points, fit);
  const context: OcCsvRowContext = { body, unit, trendMode, scale, fitByCenter };

  const header =
    "body,index,center_sec,oc_raw_sec,oc_fit_sec,oc_residual_sec,oc_display,duration_sec,ingress_sec,egress_sec,detected_at_sec,unit,trend_mode";
  const rows = series.events.map((event, index) => ocCsvRow(event, index, context));
  return `${header}\n${rows.join("\n")}\n`;
}

function fitValuesByCenter(points: OcPoint[], fit: OcFit | undefined): Map<number, number> {
  const fitByCenter = new Map<number, number>();
  if (!fit) return fitByCenter;
  for (const point of points) {
    fitByCenter.set(point.centerSec, fit.intercept + fit.slope * point.x);
  }
  return fitByCenter;
}

function ocCsvRow(
  event: TransitHistorySeries["events"][number],
  index: number,
  context: OcCsvRowContext,
): string {
  const raw = finite(event.ocSec);
  const fitSec = context.fitByCenter.get(event.centerSec);
  const residual = ocResidual(raw, fitSec);
  const display = ocDisplayValue(raw, residual, context);
  return [
    context.body,
    String(index),
    String(event.centerSec),
    csvValue(raw),
    csvValue(fitSec),
    csvValue(residual),
    csvValue(display),
    csvValue(event.durationSec),
    csvValue(event.ingressSec),
    csvValue(event.egressSec),
    event.detectedAtSec,
    context.unit,
    context.trendMode,
  ].join(",");
}

function ocResidual(raw: number | undefined, fitSec: number | undefined): number | undefined {
  return raw !== undefined && fitSec !== undefined ? raw - fitSec : undefined;
}

function ocDisplayValue(
  raw: number | undefined,
  residual: number | undefined,
  context: OcCsvRowContext,
): number | undefined {
  const displayRaw = context.trendMode === "detrended" ? residual : raw;
  return displayRaw !== undefined ? displayRaw * context.scale : undefined;
}

function csvValue(value: number | undefined): number | "" {
  return value ?? "";
}

export function exportOcCsv(state: TransitHistoryState, body: OcBody, opts: OcCsvOptions = {}): void {
  const csv = buildOcCsv(state, body, opts);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `oc-history-${body}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delay revocation so the browser has time to initiate the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function renderOcHistoryCanvas(
  canvas: HTMLCanvasElement | null,
  state: TransitHistoryState,
  body: OcBody,
  opts: { unit?: OcUnit; trendMode?: OcTrendMode } = {},
): void {
  const renderOptions = ocRenderOptions(opts);
  const metrics = canvas ? prepareOcCanvas(canvas) : undefined;
  if (!metrics) return;
  const { ctx, w, h } = metrics;
  drawOcBackground(ctx, w, h);

  const series = getOcSeries(state, body);
  const points = collectFiniteOcPoints(series);
  const fit = ocPanelFit(points, renderOptions.trendMode);
  const pointsY = ocDisplayPoints(points, fit, renderOptions.trendMode, renderOptions.scale);
  drawOcPlotFrame({
    ctx,
    w,
    h,
    body,
    pointsY,
    fit,
    trendMode: renderOptions.trendMode,
    scale: renderOptions.scale,
    unit: renderOptions.unit,
  });
}

function ocRenderOptions(opts: { unit?: OcUnit; trendMode?: OcTrendMode }): OcRenderOptions {
  const unit = opts.unit ?? "s";
  return {
    unit,
    trendMode: opts.trendMode ?? "raw",
    scale: unitScale(unit),
  };
}

function prepareOcCanvas(canvas: HTMLCanvasElement): OcCanvasMetrics | undefined {
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;

  // Apply devicePixelRatio scaling for HiDPI displays.
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  const bufW = Math.round(cssW * dpr);
  const bufH = Math.round(cssH * dpr);

  if (canvas.width !== bufW || canvas.height !== bufH) {
    canvas.width = bufW;
    canvas.height = bufH;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cssW, h: cssH };
}

function drawOcBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#04080d";
  ctx.fillRect(0, 0, w, h);
}

function ocDisplayPoints(
  points: OcPoint[],
  fit: OcFit | undefined,
  trendMode: OcTrendMode,
  scale: number,
): OcPlotPoint[] {
  // Use centerSec for the x-axis display, but epoch index (p.x) for the fit evaluation.
  return points.map((point) => ({
    x: point.centerSec,
    epoch: point.x,
    y: ocDisplayY(point, fit, trendMode, scale),
  }));
}

function ocDisplayY(point: OcPoint, fit: OcFit | undefined, trendMode: OcTrendMode, scale: number): number {
  if (trendMode === "detrended" && fit) {
    return (point.y - (fit.intercept + fit.slope * point.x)) * scale;
  }
  return point.y * scale;
}
