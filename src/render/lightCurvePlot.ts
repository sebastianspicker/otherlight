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
import {
  collectVisibleFlux,
  computeRobustRangeFromScratch,
  rangeFromStats,
  type VisibleTimeDomain,
  type VisibleWindow,
} from "./lightCurvePlotMath";
import { computeTickLayout, drawLightCurveSeries, formatTickValue } from "./lightCurvePlotSeries";

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

  /**
   * How the visible x-range behaves:
   * - "fixed": full retained history, with the x-axis anchored at t = 0
   * - "dynamic": full retained history, fitted to the current retained sample span
   * - "live": trailing time window / sample window
   */
  trackingMode?: "fixed" | "dynamic" | "live";

  /**
   * Trailing time window in seconds used by live tracking when time samples exist.
   */
  dynamicWindowSec?: number;

  /**
   * Trailing sample count used by live tracking when time samples do not exist.
   */
  dynamicWindowSamples?: number;
};

export type LightCurveSample = {
  /** Time coordinate in seconds (optional). */
  t?: number;
  /** Flux value (normalized or in stellar units; caller decides). */
  flux: number;
};

export class LightCurvePlot {
  private ctx: CanvasRenderingContext2D;
  private size?: SizeInfo;
  private flux: number[] = [];
  private t: number[] = []; // optional; may contain NaNs
  private startIndex = 0;
  private finiteTimeCount = 0;
  private earliestFiniteTime = Number.NaN;
  private earliestFiniteTimeIndex = -1;
  private latestFiniteTime = Number.NaN;
  private latestFiniteTimeIndex = -1;
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
      trackingMode: opts.trackingMode ?? "fixed",
      dynamicWindowSec: opts.dynamicWindowSec ?? 180,
      dynamicWindowSamples: opts.dynamicWindowSamples ?? 300,
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
    this.trimToCapacity();
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
    const nextTime = Number.isFinite(tt) ? (tt as number) : Number.NaN;
    this.t.push(nextTime);
    if (Number.isFinite(nextTime)) {
      this.finiteTimeCount++;
      if (this.finiteTimeCount === 1) {
        this.earliestFiniteTime = nextTime;
        this.earliestFiniteTimeIndex = this.t.length - 1;
      }
      this.latestFiniteTime = nextTime;
      this.latestFiniteTimeIndex = this.t.length - 1;
    }
    this.trimToCapacity();
  }

  clear(): void {
    this.flux = [];
    this.t = [];
    this.startIndex = 0;
    this.finiteTimeCount = 0;
    this.earliestFiniteTime = Number.NaN;
    this.earliestFiniteTimeIndex = -1;
    this.latestFiniteTime = Number.NaN;
    this.latestFiniteTimeIndex = -1;
  }

  private activeLength(): number {
    return this.flux.length - this.startIndex;
  }

  private compactHistory(force = false): void {
    if (this.startIndex <= 0) return;
    if (!force && this.startIndex < 1024 && this.startIndex * 2 < this.flux.length) return;

    if (this.earliestFiniteTimeIndex >= this.startIndex) {
      this.earliestFiniteTimeIndex -= this.startIndex;
    } else {
      this.earliestFiniteTimeIndex = -1;
      this.earliestFiniteTime = Number.NaN;
    }
    if (this.latestFiniteTimeIndex >= this.startIndex) {
      this.latestFiniteTimeIndex -= this.startIndex;
    } else {
      this.latestFiniteTimeIndex = -1;
      this.latestFiniteTime = Number.NaN;
    }
    this.flux = this.flux.slice(this.startIndex);
    this.t = this.t.slice(this.startIndex);
    this.startIndex = 0;
  }

  private trimToCapacity(): void {
    const overflow = this.activeLength() - this.capacity;
    if (overflow <= 0) return;

    const nextStartIndex = this.startIndex + overflow;
    let removedFiniteCount = 0;
    for (let i = this.startIndex; i < nextStartIndex; i++) {
      if (Number.isFinite(this.t[i])) removedFiniteCount++;
    }
    this.finiteTimeCount = Math.max(0, this.finiteTimeCount - removedFiniteCount);
    if (this.earliestFiniteTimeIndex < nextStartIndex) {
      this.earliestFiniteTimeIndex = -1;
      this.earliestFiniteTime = Number.NaN;
    }
    if (this.latestFiniteTimeIndex < nextStartIndex) {
      this.latestFiniteTimeIndex = -1;
      this.latestFiniteTime = Number.NaN;
    }
    this.startIndex = nextStartIndex;
    this.compactHistory();
  }

  private resolveEarliestFiniteTime(activeLength: number): number {
    if (this.earliestFiniteTimeIndex >= this.startIndex && Number.isFinite(this.earliestFiniteTime)) {
      return this.earliestFiniteTime;
    }

    for (let i = 0; i < activeLength; i++) {
      const index = this.startIndex + i;
      const tt = this.t[index];
      if (!Number.isFinite(tt)) continue;
      this.earliestFiniteTime = tt;
      this.earliestFiniteTimeIndex = index;
      return tt;
    }

    this.earliestFiniteTime = Number.NaN;
    this.earliestFiniteTimeIndex = -1;
    return Number.NaN;
  }

  private resolveLatestFiniteTime(activeLength: number): number {
    if (this.latestFiniteTimeIndex >= this.startIndex && Number.isFinite(this.latestFiniteTime)) {
      return this.latestFiniteTime;
    }

    for (let i = activeLength - 1; i >= 0; i--) {
      const index = this.startIndex + i;
      const tt = this.t[index];
      if (!Number.isFinite(tt)) continue;
      this.latestFiniteTime = tt;
      this.latestFiniteTimeIndex = index;
      return tt;
    }

    this.latestFiniteTime = Number.NaN;
    this.latestFiniteTimeIndex = -1;
    return Number.NaN;
  }

  private getFullVisibleTimeDomainInfo(activeLength: number): VisibleTimeDomain | null {
    if (this.opts.xMode !== "time") return null;
    if (this.finiteTimeCount <= 0) return null;

    const tMin = this.resolveEarliestFiniteTime(activeLength);
    const latestFiniteTime = this.resolveLatestFiniteTime(activeLength);
    if (!Number.isFinite(tMin) || !Number.isFinite(latestFiniteTime)) return null;
    return {
      tMin,
      tMax: latestFiniteTime > tMin ? latestFiniteTime : tMin + 1,
      allFinite: this.finiteTimeCount === activeLength,
    };
  }

  private scanVisibleTimeDomain(start: number, end: number): VisibleTimeDomain | null {
    if (this.opts.xMode !== "time") return null;

    let finiteCount = 0;
    let tMin = Number.POSITIVE_INFINITY;
    let tMax = Number.NEGATIVE_INFINITY;
    for (let i = start; i < end; i++) {
      const tt = this.t[this.startIndex + i];
      if (!Number.isFinite(tt)) continue;
      finiteCount++;
      if (tt < tMin) tMin = tt;
      if (tt > tMax) tMax = tt;
    }
    if (finiteCount === 0) return null;

    if (!(tMax > tMin)) {
      tMax = tMin + 1;
    }

    return { tMin, tMax, allFinite: finiteCount === end - start };
  }

  private getVisibleWindowInfo(): VisibleWindow {
    const n = this.activeLength();
    if (n <= 1 || this.opts.trackingMode !== "live") {
      return {
        start: 0,
        end: n,
        timeDomain: n > 0 ? this.getFullVisibleTimeDomainInfo(n) : null,
      };
    }

    const fallbackWindow = Math.max(2, Math.min(n, Math.floor(this.opts.dynamicWindowSamples)));
    const fallbackStart = Math.max(0, n - fallbackWindow);
    if (this.opts.xMode !== "time" || this.t.length - this.startIndex !== n) {
      return { start: fallbackStart, end: n, timeDomain: null };
    }

    const lastFiniteT = this.resolveLatestFiniteTime(n);
    if (!Number.isFinite(lastFiniteT)) {
      return {
        start: fallbackStart,
        end: n,
        timeDomain: this.scanVisibleTimeDomain(fallbackStart, n),
      };
    }

    const latestFiniteOffset = this.latestFiniteTimeIndex - this.startIndex;
    if (latestFiniteOffset !== n - 1) {
      return {
        start: fallbackStart,
        end: n,
        timeDomain: this.scanVisibleTimeDomain(fallbackStart, n),
      };
    }

    const windowSec = Math.max(1e-6, this.opts.dynamicWindowSec);
    const minT = lastFiniteT - windowSec;
    let start = n - 1;
    let tMin = lastFiniteT;
    while (start > 0) {
      const tt = this.t[this.startIndex + start - 1];
      if (!Number.isFinite(tt) || tt < minT) break;
      start--;
      tMin = tt;
    }

    if (n - start < 2) {
      return {
        start: fallbackStart,
        end: n,
        timeDomain: this.scanVisibleTimeDomain(fallbackStart, n),
      };
    }

    return {
      start,
      end: n,
      timeDomain: {
        tMin,
        tMax: lastFiniteT > tMin ? lastFiniteT : tMin + 1,
        allFinite: true,
      },
    };
  }

  private getVisibleSampleBounds(): { start: number; end: number } {
    const { start, end } = this.getVisibleWindowInfo();
    return { start, end };
  }

  private getVisibleTimeDomain(start: number, end: number): { tMin: number; tMax: number } | null {
    const domain = this.getVisibleTimeDomainInfo(start, end);
    return domain ? { tMin: domain.tMin, tMax: domain.tMax } : null;
  }

  private getVisibleTimeDomainInfo(start: number, end: number): VisibleTimeDomain | null {
    const activeLength = this.activeLength();
    if (this.opts.xMode !== "time" || activeLength < end) return null;

    if (start === 0 && end === activeLength) {
      return this.getFullVisibleTimeDomainInfo(activeLength);
    }

    const visibleWindow = this.getVisibleWindowInfo();
    if (visibleWindow.start === start && visibleWindow.end === end) {
      return visibleWindow.timeDomain;
    }

    return this.scanVisibleTimeDomain(start, end);
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

    const visibleWindow = this.getVisibleWindowInfo();
    const { start, end } = visibleWindow;
    const n = Math.max(0, end - start);
    if (n < 1) {
      ctx.fillStyle = "rgba(169, 184, 198, 0.5)";
      ctx.font = "12px 'Space Grotesk', sans-serif";
      ctx.fillText("Awaiting data...", marginLeft + plotW * 0.5 - 40, marginTop + plotH * 0.5);
      return;
    }

    // Determine y-range
    const visibleStart = this.startIndex + start;
    const visibleEnd = this.startIndex + end;
    const fluxValues = this.flux;
    const timeValues = this.t;
    const fluxAt = (i: number) => fluxValues[visibleStart + i];
    const useRobustRange = this.opts.yScaleMode === "robust";
    const { stats: fluxStats, robustCount } = collectVisibleFlux(
      this.flux,
      visibleStart,
      visibleEnd,
      useRobustRange,
    );
    const qLo = clamp(this.opts.yQuantiles.lo, 0, 0.499999);
    const qHi = clamp(this.opts.yQuantiles.hi, qLo + 1e-6, 1);
    let range = useRobustRange
      ? (computeRobustRangeFromScratch(robustCount, qLo, qHi) ?? rangeFromStats(fluxStats))
      : rangeFromStats(fluxStats);

    if (!range) {
      if (fluxStats.finiteCount > 0 && Number.isFinite(fluxStats.constantValue)) {
        const v = fluxStats.constantValue;
        const pad = Math.max(1e-6, Math.abs(v) * 0.01, 0.01);
        range = { lo: v - pad, hi: v + pad };
      }
    }

    if (!range && n === 1 && Number.isFinite(fluxAt(0))) {
      const v = fluxAt(0);
      const pad = Math.max(1e-6, Math.abs(v) * 0.01, 0.01);
      range = { lo: v - pad, hi: v + pad };
    }

    if (!range) return;

    const span = Math.max(1e-10, range.hi - range.lo);
    const pad = Math.max(1e-10, span * clamp(this.opts.yPadFrac, 0, 1));
    const lo = range.lo - pad;
    const hi = range.hi + pad;
    const yRange = hi - lo;

    // Transform functions (map to plot area)
    const invYSpan = 1 / (hi - lo);
    const yScale = -plotH * invYSpan;
    const yOffset = marginTop + plotH - lo * yScale;
    const yOf = (f: number) => yOffset + f * yScale;
    const indexScale = plotW / Math.max(1, n - 1);
    const xIndexOffset = marginLeft;

    // X mapping
    const timeDomain = visibleWindow.timeDomain;
    const haveTime = timeDomain !== null;
    const allFiniteTime = Boolean(timeDomain?.allFinite);
    const tMin = timeDomain?.tMin ?? 0;
    const tMax = timeDomain?.tMax ?? 0;
    const tSpan = Math.max(1e-12, tMax - tMin);
    const timeScale = haveTime ? plotW / tSpan : 0;
    const xTimeOffset = haveTime ? marginLeft - tMin * timeScale : 0;

    // --- Draw plot frame ---
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(marginLeft, marginTop, plotW, plotH);
    ctx.stroke();

    // --- Y-axis grid lines and tick labels ---
    const yTickLayout = computeTickLayout(lo, hi, Math.min(6, Math.floor(plotH / 36)));
    ctx.font = "10px 'Space Mono', monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (
      let tickVal = yTickLayout?.start ?? Number.NaN, tickCount = 0;
      Number.isFinite(tickVal) && tickVal <= hi + (yTickLayout?.step ?? 0) * 0.001 && tickCount <= 8;
      tickVal += yTickLayout?.step ?? 0, tickCount++
    ) {
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
      ctx.fillText(formatTickValue(tickVal, yRange), marginLeft - 6, yPos);
    }

    // --- X-axis ticks ---
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    if (haveTime) {
      const xTickLayout = computeTickLayout(tMin, tMax, Math.min(8, Math.floor(plotW / 80)));
      const tSpan = Math.max(1e-12, tMax - tMin);
      const tickScale = plotW / tSpan;
      const tickOffset = marginLeft - tMin * tickScale;
      for (
        let tickVal = xTickLayout?.start ?? Number.NaN, tickCount = 0;
        Number.isFinite(tickVal) && tickVal <= tMax + (xTickLayout?.step ?? 0) * 0.001 && tickCount <= 10;
        tickVal += xTickLayout?.step ?? 0, tickCount++
      ) {
        const xPos = tickOffset + tickVal * tickScale;
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
        ctx.fillText(formatTickValue(tickVal, tSpan), xPos, marginTop + plotH + 6);
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
      if (fluxStats.finiteCount > 0) {
        const mean = fluxStats.sum / fluxStats.finiteCount;
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

    // --- Main Plot: Line / single-sample marker ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(marginLeft, marginTop, plotW, plotH);
    ctx.clip();

    if (n === 1) {
      const firstFlux = fluxValues[visibleStart];
      let x = xIndexOffset;
      if (haveTime) {
        const tt = timeValues[visibleStart];
        x = allFiniteTime || Number.isFinite(tt) ? xTimeOffset + tt * timeScale : xIndexOffset;
      }
      const y = yOffset + firstFlux * yScale;
      ctx.beginPath();
      ctx.fillStyle = "#4cc9f0";
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    drawLightCurveSeries({
      ctx,
      fluxValues,
      timeValues,
      visibleStart,
      n,
      xIndexOffset,
      indexScale,
      yOffset,
      yScale,
      xTimeOffset,
      timeScale,
      plotW,
      haveTime,
      allFiniteTime,
    });
    ctx.restore();
  }
}
