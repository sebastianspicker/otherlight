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

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

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

function computeRobustRange(
  values: number[],
  qLo: number,
  qHi: number
): { lo: number; hi: number } | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return null;

  finite.sort((a, b) => a - b);
  const lo = safeQuantile(finite, qLo);
  const hi = safeQuantile(finite, qHi);

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
    opts: LightCurvePlotOptions = {}
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

    // Trim if needed.
    while (this.flux.length > this.capacity) this.flux.shift();
    while (this.t.length > this.capacity) this.t.shift();
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
  pushSample(sample: LightCurveSample): void;

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

  draw(): void {
    this.size = ensureHiDPICanvas(this.canvas, this.ctx, this.size);
    const ctx = this.ctx;
    const w = this.size.cssW;
    const h = this.size.cssH;

    // Clear & background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);

    // Title / empty state
    ctx.fillStyle = "rgba(0,0,0,0.70)";
    ctx.font =
      "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillText(this.opts.title, 10, 16);

    const n = this.flux.length;
    if (n < 2) return;

    // Determine y-range
    const qLo = clamp(this.opts.yQuantiles.lo, 0, 0.499999);
    const qHi = clamp(this.opts.yQuantiles.hi, qLo + 1e-6, 1);
    const range =
      this.opts.yScaleMode === "minmax"
        ? computeMinMax(this.flux)
        : computeRobustRange(this.flux, qLo, qHi) ?? computeMinMax(this.flux);

    if (!range) return;

    const span = Math.max(1e-10, range.hi - range.lo);
    const pad = Math.max(1e-10, span * clamp(this.opts.yPadFrac, 0, 1));
    const lo = range.lo - pad;
    const hi = range.hi + pad;

    // Transform functions
    const yOf = (f: number) => h - ((f - lo) / (hi - lo)) * h;

    // X mapping
    const haveTime =
      this.opts.xMode === "time" &&
      this.t.length === n &&
      this.t.some((v) => Number.isFinite(v)) &&
      this.t.filter((v) => Number.isFinite(v)).length >= 2;

    let xOf: (i: number) => number;
    if (!haveTime) {
      xOf = (i: number) => (i / (n - 1)) * w;
    } else {
      let tMin = Number.POSITIVE_INFINITY;
      let tMax = Number.NEGATIVE_INFINITY;
      for (const tt of this.t) {
        if (!Number.isFinite(tt)) continue;
        if (tt < tMin) tMin = tt;
        if (tt > tMax) tMax = tt;
      }
      const tSpan = Math.max(1e-12, tMax - tMin);
      xOf = (i: number) => {
        const tt = this.t[i];
        return Number.isFinite(tt)
          ? ((tt - tMin) / tSpan) * w
          : (i / (n - 1)) * w; // Fallback
      };
    }

    // Baselines
    if (this.opts.showUnityBaseline) {
      const y1 = yOf(1.0);
      if (y1 >= 0 && y1 <= h) {
        ctx.beginPath();
        ctx.strokeStyle = "#ccc";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.moveTo(0, y1);
        ctx.lineTo(w, y1);
        ctx.stroke();
        ctx.setLineDash([]);
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
        ctx.beginPath();
        ctx.strokeStyle = "rgba(0, 150, 0, 0.5)";
        ctx.lineWidth = 1;
        ctx.moveTo(0, yMean);
        ctx.lineTo(w, yMean);
        ctx.stroke();
      }
    }

    // Main Plot: Line
    ctx.beginPath();
    ctx.strokeStyle = "#2563eb"; // standard blue
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";

    // PERFORMANCE OPTIMIZATION: Downsampling (Min-Max Decimation)
    // If we have significantly more points than pixels, we group them.
    const threshold = w * 2; // draw at most ~2 points per pixel column

    if (n <= threshold) {
      // Standard drawing for low count
      ctx.moveTo(xOf(0), yOf(this.flux[0]));
      for (let i = 1; i < n; i++) {
        ctx.lineTo(xOf(i), yOf(this.flux[i]));
      }
    } else {
      // Downsampling
      ctx.moveTo(xOf(0), yOf(this.flux[0]));
      
      // Bucket size
      const step = Math.floor(n / w);
      
      for (let i = 0; i < n; i += step) {
        // Find min/max in this bucket to preserve spikes
        let chunkMin = Number.POSITIVE_INFINITY;
        let chunkMax = Number.NEGATIVE_INFINITY;
        let chunkMinIdx = -1;
        let chunkMaxIdx = -1;
        
        const limit = Math.min(n, i + step);
        for (let j = i; j < limit; j++) {
            const v = this.flux[j];
            if (v < chunkMin) { chunkMin = v; chunkMinIdx = j; }
            if (v > chunkMax) { chunkMax = v; chunkMaxIdx = j; }
        }

        if (chunkMinIdx !== -1) {
            // Draw vertical line from min to max at the approximate x position
            // (or actually connect them in order of occurrence if we want to be fancy,
            // but just connecting min and max is usually enough for visual plots)
            
            // To be safe and simple: line to min, then line to max.
            // Order doesn't matter much for dense visual noise.
            const x = xOf(Math.floor((i + limit)/2)); 
            ctx.lineTo(x, yOf(chunkMin));
            ctx.lineTo(x, yOf(chunkMax));
        }
      }
    }
    ctx.stroke();
  }
}
