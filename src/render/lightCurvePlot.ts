// src/render/lightCurvePlot.ts

//
// Light-curve plotter (Canvas2D).
//
// Design goals:
// - Visual-only: does not affect simulation state.
// - HiDPI-correct: uses ensureHiDPICanvas() so drawing uses CSS pixels.
// - Robust scaling: avoid axis blow-ups from rare outliers (instrument noise spikes etc.).
// - Backwards-compatible API: push(flux), clear(), draw() as in the previous canvas2d.ts.
//
// Notes on "scientific correctness" in this context:
// - We do not "modify" the flux. The plot displays the provided flux samples.
// - Autoscaling uses robust quantiles by default (display choice, not a data change).
// - Optional time axis is supported for correct temporal interpretation if caller provides t.

import { clamp, isFiniteNumber } from "../core/units";
import { ensureHiDPICanvas, type SizeInfo } from "./canvasUtil";

export type LightCurvePlotOptions = {
  /**
   * How to map samples to x:
   * - "index": equally spaced samples (backwards-compatible default).
   * - "time": uses provided t values (seconds) when available.
   */
  xMode?: "index" | "time";

  /**
   * Scaling mode:
   * - "robust": use low/high quantiles (recommended default).
   * - "minmax": strict min/max of the visible samples.
   */
  yScaleMode?: "robust" | "minmax";

  /**
   * Quantiles used in robust scaling, e.g. [0.01, 0.99].
   * Must satisfy 0 <= qLo < qHi <= 1.
   */
  yQuantiles?: { lo: number; hi: number };

  /**
   * Extra padding fraction added to y-range after scaling (relative to span).
   * A small padding prevents the curve from touching the frame.
   */
  yPadFrac?: number;

  /**
   * If true, draw a horizontal baseline at y=1.0.
   * Useful because most fluxes in this project are normalized near 1.
   */
  showUnityBaseline?: boolean;

  /**
   * If true, draw a mean line of the currently visible data (finite samples only).
   */
  showMeanLine?: boolean;

  /**
   * Visual label in the top-left corner.
   */
  title?: string;
};

export type LightCurveSample = {
  /** Time coordinate in seconds (optional). */
  t?: number;
  /** Flux value (normalized or in stellar units; caller decides). */
  flux: number;
};

function safeQuantile(sorted: number[], q: number): number {
  // sorted must be non-empty.
  const qq = clamp(q, 0, 1);
  const n = sorted.length;
  if (n === 1) return sorted[0];

  // Linear interpolation between nearest ranks (type=7-ish behavior).
  const idx = (n - 1) * qq;
  const i0 = Math.floor(idx);
  const i1 = Math.min(n - 1, i0 + 1);
  const f = idx - i0;

  return sorted[i0] * (1 - f) + sorted[i1] * f;
}

// Reusable scratch buffer to avoid allocating a filtered array every frame.
let _robustScratch: number[] = [];

function computeRobustRange(values: number[], qLo: number, qHi: number): { lo: number; hi: number } | null {
  // Collect finite values into scratch buffer (avoids filter+new array per call).
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) {
      _robustScratch[count++] = values[i];
    }
  }
  if (count < 2) return null;

  // Sort only the populated portion.
  // We create a view only if scratch grew beyond count, otherwise sort in-place.
  if (_robustScratch.length > count) _robustScratch.length = count;
  _robustScratch.sort((a, b) => a - b);

  const lo = safeQuantile(_robustScratch, qLo);
  const hi = safeQuantile(_robustScratch, qHi);

  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (hi <= lo) return null;

  return { lo, hi };
}

function computeMinMax(values: number[]): { lo: number; hi: number } | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;

  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }

  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (hi <= lo) return null;

  return { lo, hi };
}

export class LightCurvePlot {
  private ctx: CanvasRenderingContext2D;
  private size?: SizeInfo;
  private flux: number[] = [];
  private t: number[] = []; // optional; may contain NaNs
  private opts: Required<LightCurvePlotOptions>;

  constructor(
    private canvas: HTMLCanvasElement,
    private capacity = 2000,
    opts: LightCurvePlotOptions = {},
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("LightCurvePlot: 2D context unavailable.");
    this.ctx = ctx;

    this.opts = {
      xMode: opts.xMode ?? "index",
      yScaleMode: opts.yScaleMode ?? "robust",
      yQuantiles: {
        lo: opts.yQuantiles?.lo ?? 0.01,
        hi: opts.yQuantiles?.hi ?? 0.99,
      },
      yPadFrac: opts.yPadFrac ?? 0.15,
      showUnityBaseline: opts.showUnityBaseline ?? true,
      showMeanLine: opts.showMeanLine ?? false,
      title: opts.title ?? "Flux (normalized)",
    };

    this.size = ensureHiDPICanvas(this.canvas, this.ctx, this.size);
    this.setCapacity(capacity);
  }

  setOptions(next: LightCurvePlotOptions): void {
    this.opts = {
      ...this.opts,
      ...next,
      yQuantiles: {
        lo: next.yQuantiles?.lo ?? this.opts.yQuantiles.lo,
        hi: next.yQuantiles?.hi ?? this.opts.yQuantiles.hi,
      },
    };
  }

  setCapacity(n: number): void {
    const nn = Math.max(10, Math.floor(isFiniteNumber(n) ? n : 2000));
    this.capacity = nn;

    // Trim if needed — use slice to avoid O(n^2) from repeated shift().
    if (this.flux.length > this.capacity) this.flux = this.flux.slice(-this.capacity);
    if (this.t.length > this.capacity) this.t = this.t.slice(-this.capacity);
  }

  /**
   * Backwards-compatible: push only flux.
   */
  push(flux: number): void;
  /**
   * Optional time-aware push.
   */
  push(flux: number, tSec?: number): void;
  /**
   * Explicit sample object form.
   */
  push(a: number | LightCurveSample, b?: number): void {
    if (typeof a === "object") {
      this.pushSample(a);
      return;
    }
    const flux = a;
    const tSec = b;
    this.pushSample({ flux, t: tSec });
  }

  pushSample(sample: LightCurveSample): void {
    const f = sample.flux;
    if (!Number.isFinite(f)) return;

    this.flux.push(f);
    const tt = sample.t;
    this.t.push(Number.isFinite(tt) ? (tt as number) : Number.NaN);

    if (this.flux.length > this.capacity) this.flux.shift();
    if (this.t.length > this.capacity) this.t.shift();
  }

  clear(): void {
    this.flux = [];
    this.t = [];
  }

  /**
   * Compute nice tick values for an axis range.
   * Returns an array of values within [lo, hi] spaced at human-readable intervals.
   */
  private computeTicks(lo: number, hi: number, maxTicks: number): number[] {
    const range = hi - lo;
    if (range <= 0 || !Number.isFinite(range)) return [];

    // Find a "nice" step: 1, 2, 5, 10, 20, 50, ...
    const roughStep = range / Math.max(2, maxTicks);
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / magnitude;

    let niceStep: number;
    if (normalized <= 1.5) niceStep = magnitude;
    else if (normalized <= 3.5) niceStep = 2 * magnitude;
    else if (normalized <= 7.5) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    const ticks: number[] = [];
    const start = Math.ceil(lo / niceStep) * niceStep;
    for (let i = 0; ; i++) {
      const v = start + i * niceStep;
      if (v > hi + niceStep * 0.001) break;
      if (v >= lo && v <= hi) ticks.push(v);
      if (ticks.length > maxTicks + 2) break;
    }
    return ticks;
  }

  /**
   * Format a tick value for axis display with appropriate precision.
   */
  private formatTickValue(v: number, range: number): string {
    if (!Number.isFinite(v)) return "";
    const absV = Math.abs(v);

    // For very small ranges (transit depths), use more decimal places
    if (range < 0.001) return v.toFixed(6);
    if (range < 0.01) return v.toFixed(5);
    if (range < 0.1) return v.toFixed(4);
    if (range < 1) return v.toFixed(3);
    if (absV >= 1e4 || (absV > 0 && absV < 0.01)) return v.toExponential(1);
    if (range < 10) return v.toFixed(2);
    if (range < 100) return v.toFixed(1);
    return v.toFixed(0);
  }

  draw(): void {
    this.size = ensureHiDPICanvas(this.canvas, this.ctx, this.size);
    const ctx = this.ctx;
    const w = this.size.cssW;
    const h = this.size.cssH;

    // P2-Render-1: Dimension validity must be checked before any drawing.
    if (!Number.isFinite(w) || w < 1 || !Number.isFinite(h) || h < 1) return;

    // Plot margins for axis labels and tick marks
    const marginLeft = 62;
    const marginRight = 12;
    const marginTop = 28;
    const marginBottom = 26;
    const plotW = Math.max(1, w - marginLeft - marginRight);
    const plotH = Math.max(1, h - marginTop - marginBottom);

    // Clear & background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#060a10";
    ctx.fillRect(0, 0, w, h);

    // Title (top-left, outside plot area)
    ctx.fillStyle = "rgba(238, 244, 248, 0.85)";
    ctx.font = "600 12px 'Space Grotesk', sans-serif";
    ctx.fillText(this.opts.title, marginLeft, 16);

    const n = this.flux.length;
    if (n < 2) {
      ctx.fillStyle = "rgba(169, 184, 198, 0.5)";
      ctx.font = "12px 'Space Grotesk', sans-serif";
      ctx.fillText("Awaiting data...", marginLeft + plotW * 0.5 - 40, marginTop + plotH * 0.5);
      return;
    }

    // Determine y-range
    const qLo = clamp(this.opts.yQuantiles.lo, 0, 0.499999);
    const qHi = clamp(this.opts.yQuantiles.hi, qLo + 1e-6, 1);
    const range =
      this.opts.yScaleMode === "minmax"
        ? computeMinMax(this.flux)
        : (computeRobustRange(this.flux, qLo, qHi) ?? computeMinMax(this.flux));

    if (!range) return;

    const span = Math.max(1e-10, range.hi - range.lo);
    const pad = Math.max(1e-10, span * clamp(this.opts.yPadFrac, 0, 1));
    const lo = range.lo - pad;
    const hi = range.hi + pad;
    const yRange = hi - lo;

    // Transform functions (map to plot area)
    const yOf = (f: number) => marginTop + plotH - ((f - lo) / (hi - lo)) * plotH;
    const xOfPlot = (px: number) => marginLeft + px;

    // X mapping
    let finiteCount = 0;
    if (this.opts.xMode === "time" && this.t.length === n) {
      for (const v of this.t) { if (Number.isFinite(v) && ++finiteCount >= 2) break; }
    }
    const haveTime = finiteCount >= 2;

    let tMin = 0;
    let tMax = 0;
    let xOf: (i: number) => number;
    if (!haveTime) {
      xOf = (i: number) => xOfPlot((i / (n - 1)) * plotW);
    } else {
      tMin = Number.POSITIVE_INFINITY;
      tMax = Number.NEGATIVE_INFINITY;
      for (const tt of this.t) {
        if (!Number.isFinite(tt)) continue;
        if (tt < tMin) tMin = tt;
        if (tt > tMax) tMax = tt;
      }
      const tSpan = Math.max(1e-12, tMax - tMin);
      xOf = (i: number) => {
        const tt = this.t[i];
        return Number.isFinite(tt)
          ? xOfPlot(((tt - tMin) / tSpan) * plotW)
          : xOfPlot((i / (n - 1)) * plotW);
      };
    }

    // --- Draw plot frame ---
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(marginLeft, marginTop, plotW, plotH);
    ctx.stroke();

    // --- Y-axis grid lines and tick labels ---
    const yTicks = this.computeTicks(lo, hi, Math.min(6, Math.floor(plotH / 36)));
    ctx.font = "10px 'Space Mono', monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (const tickVal of yTicks) {
      const yPos = yOf(tickVal);
      if (yPos < marginTop + 2 || yPos > marginTop + plotH - 2) continue;

      // Grid line
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.moveTo(marginLeft, yPos);
      ctx.lineTo(marginLeft + plotW, yPos);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tick mark
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1;
      ctx.moveTo(marginLeft - 4, yPos);
      ctx.lineTo(marginLeft, yPos);
      ctx.stroke();

      // Label
      ctx.fillStyle = "rgba(169, 184, 198, 0.9)";
      ctx.fillText(this.formatTickValue(tickVal, yRange), marginLeft - 6, yPos);
    }

    // --- X-axis ticks ---
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    if (haveTime) {
      const xTicks = this.computeTicks(tMin, tMax, Math.min(8, Math.floor(plotW / 80)));
      const tSpan = Math.max(1e-12, tMax - tMin);
      for (const tickVal of xTicks) {
        const xPos = xOfPlot(((tickVal - tMin) / tSpan) * plotW);
        if (xPos < marginLeft + 2 || xPos > marginLeft + plotW - 2) continue;

        // Grid line
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.moveTo(xPos, marginTop);
        ctx.lineTo(xPos, marginTop + plotH);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tick mark
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 1;
        ctx.moveTo(xPos, marginTop + plotH);
        ctx.lineTo(xPos, marginTop + plotH + 4);
        ctx.stroke();

        // Label
        ctx.fillStyle = "rgba(169, 184, 198, 0.9)";
        ctx.fillText(this.formatTickValue(tickVal, tSpan), xPos, marginTop + plotH + 6);
      }
    }

    // --- Axis labels ---
    // Y-axis label (rotated)
    ctx.save();
    ctx.fillStyle = "rgba(208, 219, 229, 0.8)";
    ctx.font = "11px 'Space Grotesk', sans-serif";
    ctx.translate(12, marginTop + plotH * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("F / F\u2080", 0, 0);
    ctx.restore();

    // X-axis label
    if (haveTime) {
      ctx.fillStyle = "rgba(208, 219, 229, 0.8)";
      ctx.font = "11px 'Space Grotesk', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("t [s]", marginLeft + plotW * 0.5, h - 10);
    }

    // --- Baselines ---
    if (this.opts.showUnityBaseline) {
      const y1 = yOf(1.0);
      if (y1 >= marginTop && y1 <= marginTop + plotH) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(46, 195, 177, 0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.moveTo(marginLeft, y1);
        ctx.lineTo(marginLeft + plotW, y1);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label for baseline
        ctx.fillStyle = "rgba(46, 195, 177, 0.55)";
        ctx.font = "9px 'Space Mono', monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText("F\u2080 = 1", marginLeft + plotW - 32, y1 - 2);
      }
    }

    if (this.opts.showMeanLine) {
      let sum = 0;
      let cnt = 0;
      for (const f of this.flux) {
        if (Number.isFinite(f)) {
          sum += f;
          cnt++;
        }
      }
      if (cnt > 0) {
        const mean = sum / cnt;
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
    }

    // --- Main Plot: Line ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(marginLeft, marginTop, plotW, plotH);
    ctx.clip();

    ctx.beginPath();
    ctx.strokeStyle = "#4cc9f0";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";

    // PERFORMANCE OPTIMIZATION: Downsampling (Min-Max Decimation)
    const threshold = plotW * 2;

    if (n <= threshold) {
      ctx.moveTo(xOf(0), yOf(this.flux[0]));
      for (let i = 1; i < n; i++) {
        ctx.lineTo(xOf(i), yOf(this.flux[i]));
      }
    } else {
      ctx.moveTo(xOf(0), yOf(this.flux[0]));
      const step = Math.max(1, Math.floor(n / plotW));

      for (let i = 1; i < n; i += step) {
        let chunkMin = Number.POSITIVE_INFINITY;
        let chunkMax = Number.NEGATIVE_INFINITY;
        let chunkMinIdx = -1;
        let chunkMaxIdx = -1;

        const limit = Math.min(n, i + step);
        for (let j = i; j < limit; j++) {
          const v = this.flux[j];
          if (v < chunkMin) {
            chunkMin = v;
            chunkMinIdx = j;
          }
          if (v > chunkMax) {
            chunkMax = v;
            chunkMaxIdx = j;
          }
        }

        if (chunkMinIdx !== -1 && chunkMaxIdx !== -1) {
          const x = xOf(Math.floor((i + limit) / 2));
          if (chunkMinIdx <= chunkMaxIdx) {
            ctx.lineTo(x, yOf(chunkMin));
            ctx.lineTo(x, yOf(chunkMax));
          } else {
            ctx.lineTo(x, yOf(chunkMax));
            ctx.lineTo(x, yOf(chunkMin));
          }
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }
}
