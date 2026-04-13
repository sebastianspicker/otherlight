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

import type { SizeInfo } from "./canvasUtil";
import {
  clearLightCurveHistory,
  createLightCurveHistoryState,
  pushLightCurveSample,
  setLightCurveCapacity,
} from "./lightCurvePlotBuffer";
import type { VisibleTimeDomain, VisibleWindow } from "./lightCurvePlotMath";
import { drawLightCurvePlot } from "./lightCurvePlotRenderer";
import type {
  LightCurveBadge,
  LightCurveComparisonInset,
  LightCurveHistoryState,
  LightCurveMarker,
  LightCurveOverlaySeries,
  LightCurveWindowOverlay,
  LightCurvePlotOptions,
  LightCurveSample,
  ResolvedLightCurvePlotOptions,
} from "./lightCurvePlotTypes";
import {
  getVisibleSampleBounds,
  getVisibleTimeDomain,
  getVisibleTimeDomainInfo,
  getVisibleWindowInfo,
} from "./lightCurvePlotViewport";

export type { LightCurvePlotOptions, LightCurveSample } from "./lightCurvePlotTypes";

export class LightCurvePlot {
  private ctx: CanvasRenderingContext2D;
  private size?: SizeInfo;
  private state: LightCurveHistoryState;
  private opts: ResolvedLightCurvePlotOptions;
  private overlaySeries: LightCurveOverlaySeries[] = [];
  private markers: LightCurveMarker[] = [];
  private windowOverlays: LightCurveWindowOverlay[] = [];
  private badges: LightCurveBadge[] = [];
  private comparisonInset?: LightCurveComparisonInset;
  private get flux(): number[] {
    return this.state.flux;
  }
  private get t(): number[] {
    return this.state.t;
  }

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
      manualYRange: opts.manualYRange,
      showUnityBaseline: opts.showUnityBaseline ?? true,
      showMeanLine: opts.showMeanLine ?? false,
      title: opts.title ?? "Flux (normalized)",
      trackingMode: opts.trackingMode ?? "fixed",
      dynamicWindowSec: opts.dynamicWindowSec ?? 180,
      dynamicWindowSamples: opts.dynamicWindowSamples ?? 300,
    };

    this.state = createLightCurveHistoryState(capacity);
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
    setLightCurveCapacity(this.state, n);
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
    pushLightCurveSample(this.state, sample);
  }

  clear(): void {
    clearLightCurveHistory(this.state);
  }

  setOverlaySeries(series: LightCurveOverlaySeries[]): void {
    this.overlaySeries = Array.isArray(series) ? [...series] : [];
  }

  setMarkers(markers: LightCurveMarker[]): void {
    this.markers = Array.isArray(markers) ? [...markers] : [];
  }

  setWindowOverlays(overlays: LightCurveWindowOverlay[]): void {
    this.windowOverlays = Array.isArray(overlays) ? [...overlays] : [];
  }

  setBadges(badges: LightCurveBadge[]): void {
    this.badges = Array.isArray(badges) ? [...badges] : [];
  }

  setComparisonInset(inset?: LightCurveComparisonInset): void {
    this.comparisonInset = inset;
  }

  private getVisibleWindowInfo(): VisibleWindow {
    return getVisibleWindowInfo(this.state, this.opts);
  }

  private getVisibleSampleBounds(): { start: number; end: number } {
    return getVisibleSampleBounds(this.state, this.opts);
  }

  private getVisibleTimeDomain(start: number, end: number): { tMin: number; tMax: number } | null {
    return getVisibleTimeDomain(this.state, this.opts, start, end);
  }

  private getVisibleTimeDomainInfo(start: number, end: number): VisibleTimeDomain | null {
    return getVisibleTimeDomainInfo(this.state, this.opts, start, end);
  }

  draw(): void {
    this.size = drawLightCurvePlot({
      canvas: this.canvas,
      ctx: this.ctx,
      size: this.size,
      state: this.state,
      opts: this.opts,
      visibleWindow: this.getVisibleWindowInfo(),
      overlaySeries: this.overlaySeries,
      markers: this.markers,
      windowOverlays: this.windowOverlays,
      badges: this.badges,
      comparisonInset: this.comparisonInset,
    });
  }
}
