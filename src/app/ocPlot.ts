import type { TransitHistorySeries, TransitHistoryState } from "./transitHistory";

export type OcBody = "planet" | "moon";
export type OcUnit = "s" | "ms";
export type OcTrendMode = "raw" | "fit" | "detrended";
export type OcCsvOptions = { unit?: OcUnit; trendMode?: OcTrendMode };

function finite(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function fmt(v: number | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toExponential(3) : "n/a";
}

export function getOcSeries(state: TransitHistoryState, body: OcBody): TransitHistorySeries {
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

function collectFiniteOcPoints(series: TransitHistorySeries): Array<{ x: number; y: number }> {
  return series.events
    .map((e) => ({ x: finite(e.centerSec), y: finite(e.ocSec) }))
    .filter((p): p is { x: number; y: number } => p.x !== undefined && p.y !== undefined);
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
  return { slope, intercept, rmsResidual: Math.sqrt(rss / n) };
}

export function formatOcPanelStats(
  state: TransitHistoryState,
  body: OcBody,
  opts: { unit?: OcUnit; trendMode?: OcTrendMode } = {},
): string {
  const unit = opts.unit ?? "s";
  const trendMode = opts.trendMode ?? "raw";
  const series = getOcSeries(state, body);
  const points = collectFiniteOcPoints(series);
  const fit = trendMode === "raw" ? undefined : fitLinearEphemeris(points);
  const n = series.events.length;
  const latest = series.latestOcSec;
  const rms = series.rmsOcSec;
  const lastDur = finite(series.events[n - 1]?.durationSec);
  const slopePerDay = fit ? fit.slope * 86_400 : undefined;
  const rmsResidual = fit ? fit.rmsResidual : undefined;
  const unitTxt = unitLabel(unit);

  if (trendMode === "raw") {
    return `${body} events=${n} latest=${fmtWithUnit(latest, unit)} rms=${fmtWithUnit(rms, unit)} dur=${fmt(lastDur)} s [${unitTxt}]`;
  }
  if (trendMode === "fit") {
    return `${body} events=${n} latest=${fmtWithUnit(latest, unit)} rms=${fmtWithUnit(rms, unit)} slope=${fmtWithUnit(slopePerDay, unit)}/day`;
  }
  return `${body} events=${n} detrendedRms=${fmtWithUnit(rmsResidual, unit)} slope=${fmtWithUnit(slopePerDay, unit)}/day`;
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
  const slopePerDay = fit.slope * 86_400;
  return `${body} fit slope=${fmtWithUnit(slopePerDay, unit)}/day intercept=${fmtWithUnit(fit.intercept, unit)} rms=${fmtWithUnit(fit.rmsResidual, unit)}`;
}

export function buildOcCsv(state: TransitHistoryState, body: OcBody, opts: OcCsvOptions = {}): string {
  const unit = opts.unit ?? "s";
  const trendMode = opts.trendMode ?? "raw";
  const scale = unitScale(unit);
  const series = getOcSeries(state, body);
  const points = collectFiniteOcPoints(series);
  const fit = fitLinearEphemeris(points);
  const fitByCenter = new Map<number, number>();
  for (const p of points) {
    if (fit) fitByCenter.set(p.x, fit.intercept + fit.slope * p.x);
  }

  const header =
    "body,index,center_sec,oc_raw_sec,oc_fit_sec,oc_residual_sec,oc_display,duration_sec,ingress_sec,egress_sec,detected_at_sec,unit,trend_mode";
  const rows = series.events.map((e, i) => {
    const raw = finite(e.ocSec);
    const fitSec = finite(e.centerSec) !== undefined ? fitByCenter.get(e.centerSec) : undefined;
    const residual = raw !== undefined && fitSec !== undefined ? raw - fitSec : undefined;
    const displayRaw = trendMode === "detrended" ? residual : raw;
    const display = displayRaw !== undefined ? displayRaw * scale : undefined;
    return [
      body,
      String(i),
      String(e.centerSec),
      raw ?? "",
      fitSec ?? "",
      residual ?? "",
      display ?? "",
      e.durationSec ?? "",
      e.ingressSec ?? "",
      e.egressSec ?? "",
      e.detectedAtSec,
      unit,
      trendMode,
    ].join(",");
  });
  return `${header}\n${rows.join("\n")}\n`;
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
  URL.revokeObjectURL(url);
}

export function renderOcHistoryCanvas(
  canvas: HTMLCanvasElement | null,
  state: TransitHistoryState,
  body: OcBody,
  opts: { unit?: OcUnit; trendMode?: OcTrendMode } = {},
): void {
  const unit = opts.unit ?? "s";
  const trendMode = opts.trendMode ?? "raw";
  const scale = unitScale(unit);

  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#04080d";
  ctx.fillRect(0, 0, w, h);

  const series = getOcSeries(state, body);
  const points = collectFiniteOcPoints(series);
  const fit = trendMode === "raw" ? undefined : fitLinearEphemeris(points);
  const pointsY = points.map((p) => {
    const yRaw = p.y;
    if (trendMode === "detrended" && fit) {
      return { ...p, y: (yRaw - (fit.intercept + fit.slope * p.x)) * scale };
    }
    return { ...p, y: yRaw * scale };
  });

  const m = { l: 46, r: 12, t: 14, b: 28 };
  const x0 = m.l;
  const y0 = h - m.b;
  const pw = Math.max(1, w - m.l - m.r);
  const ph = Math.max(1, h - m.t - m.b);

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + pw, y0);
  ctx.moveTo(x0, m.t);
  ctx.lineTo(x0, y0);
  ctx.stroke();

  if (pointsY.length === 0) {
    ctx.fillStyle = "rgba(220,230,240,0.8)";
    ctx.font = "12px Space Mono, monospace";
    ctx.fillText(`No ${body} O-C events`, x0 + 8, m.t + 16);
    return;
  }

  let xMin = pointsY[0].x;
  let xMax = pointsY[0].x;
  let yMaxAbs = Math.abs(pointsY[0].y);
  for (const p of pointsY) {
    xMin = Math.min(xMin, p.x);
    xMax = Math.max(xMax, p.x);
    yMaxAbs = Math.max(yMaxAbs, Math.abs(p.y));
  }
  if (xMax <= xMin) xMax = xMin + 1;
  if (!(yMaxAbs > 0)) yMaxAbs = 1e-9;
  yMaxAbs *= 1.25;

  const sx = (x: number) => x0 + ((x - xMin) / (xMax - xMin)) * pw;
  const sy = (y: number) => m.t + ((yMaxAbs - y) / (2 * yMaxAbs)) * ph;

  const yZero = sy(0);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.moveTo(x0, yZero);
  ctx.lineTo(x0 + pw, yZero);
  ctx.stroke();

  if (trendMode === "fit" && fit) {
    ctx.save();
    ctx.strokeStyle = "rgba(245,194,107,0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    const yFit0 = (fit.intercept + fit.slope * xMin) * scale;
    const yFit1 = (fit.intercept + fit.slope * xMax) * scale;
    ctx.moveTo(sx(xMin), sy(yFit0));
    ctx.lineTo(sx(xMax), sy(yFit1));
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = "rgba(46,195,177,0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  pointsY.forEach((p, i) => {
    const x = sx(p.x);
    const y = sy(p.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#f5c26b";
  for (const p of pointsY) {
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.y), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(220,230,240,0.85)";
  ctx.font = "11px Space Mono, monospace";
  const label = trendMode === "detrended" ? `detrended O-C [${unitLabel(unit)}]` : `O-C [${unitLabel(unit)}]`;
  ctx.fillText(label, 8, m.t + 10);
  ctx.fillText(String(xMin.toFixed(0)), x0, h - 8);
  const xText = String(xMax.toFixed(0));
  ctx.fillText(xText, x0 + pw - ctx.measureText(xText).width, h - 8);
}
