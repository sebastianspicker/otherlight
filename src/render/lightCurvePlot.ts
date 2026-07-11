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
import { attachCanvasResizeObserver } from "./canvasUtil";
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

export type LightCurveAccessibleSnapshot = {
  sampleCount: number;
  timeMinSec?: number;
  timeMaxSec?: number;
  fluxMin?: number;
  fluxMax?: number;
  latestFlux?: number;
};

export type LightCurveHistorySnapshot = {
  flux: number[];
  timeSec: number[];
};

type LightCurveTrackingOptions = Pick<
  ResolvedLightCurvePlotOptions,
  "xMode" | "trackingMode" | "dynamicWindowSec" | "dynamicWindowSamples"
>;
type LightCurveScaleOptions = Pick<
  ResolvedLightCurvePlotOptions,
  "yScaleMode" | "yQuantiles" | "yPadFrac" | "manualYRange"
>;
type LightCurveDisplayOptions = Pick<
  ResolvedLightCurvePlotOptions,
  "showUnityBaseline" | "showMeanLine" | "title"
>;

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
  private detachResizeObserver: () => void;

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
    this.ctx = getLightCurveContext(canvas);
    this.opts = resolveLightCurvePlotOptions(opts);
    this.state = createLightCurveHistoryState(capacity);
    this.detachResizeObserver = attachCanvasResizeObserver(canvas);
  }

  /** Disconnect the ResizeObserver. Call when the plot is permanently discarded. */
  dispose(): void {
    this.detachResizeObserver();
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

  createHistorySnapshot(): LightCurveHistorySnapshot {
    return {
      flux: this.state.flux.slice(this.state.startIndex),
      timeSec: this.state.t.slice(this.state.startIndex),
    };
  }

  restoreHistorySnapshot(snapshot: LightCurveHistorySnapshot): void {
    clearLightCurveHistory(this.state);
    const count = Math.min(snapshot.flux.length, snapshot.timeSec.length);
    for (let index = 0; index < count; index++) {
      pushLightCurveSample(this.state, { flux: snapshot.flux[index], t: snapshot.timeSec[index] });
    }
  }

  getAccessibleSnapshot(): LightCurveAccessibleSnapshot {
    const snapshot = this.createHistorySnapshot();
    const finiteFlux = snapshot.flux.filter(Number.isFinite);
    const finiteTime = snapshot.timeSec.filter(Number.isFinite);
    return {
      sampleCount: finiteFlux.length,
      timeMinSec: finiteTime.length > 0 ? Math.min(...finiteTime) : undefined,
      timeMaxSec: finiteTime.length > 0 ? Math.max(...finiteTime) : undefined,
      fluxMin: finiteFlux.length > 0 ? Math.min(...finiteFlux) : undefined,
      fluxMax: finiteFlux.length > 0 ? Math.max(...finiteFlux) : undefined,
      latestFlux: finiteFlux.length > 0 ? finiteFlux[finiteFlux.length - 1] : undefined,
    };
  }

  buildCsv(): string {
    const snapshot = this.createHistorySnapshot();
    const rows = snapshot.flux.map((flux, index) => {
      const time = snapshot.timeSec[index];
      return `${Number.isFinite(time) ? time : ""},${flux}`;
    });
    return `time_s,flux\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
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

function getLightCurveContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("LightCurvePlot: 2D context unavailable.");
  return ctx;
}

function resolveLightCurvePlotOptions(opts: LightCurvePlotOptions): ResolvedLightCurvePlotOptions {
  return {
    ...resolveLightCurveTrackingOptions(opts),
    ...resolveLightCurveScaleOptions(opts),
    ...resolveLightCurveDisplayOptions(opts),
  };
}

function resolveLightCurveTrackingOptions(opts: LightCurvePlotOptions): LightCurveTrackingOptions {
  return {
    xMode: defaultOption(opts.xMode, "index"),
    trackingMode: defaultOption(opts.trackingMode, "fixed"),
    dynamicWindowSec: defaultOption(opts.dynamicWindowSec, 180),
    dynamicWindowSamples: defaultOption(opts.dynamicWindowSamples, 300),
  };
}

function resolveLightCurveScaleOptions(opts: LightCurvePlotOptions): LightCurveScaleOptions {
  return {
    yScaleMode: defaultOption(opts.yScaleMode, "robust"),
    yQuantiles: resolveLightCurveYQuantiles(opts.yQuantiles),
    yPadFrac: defaultOption(opts.yPadFrac, 0.15),
    manualYRange: opts.manualYRange,
  };
}

function resolveLightCurveDisplayOptions(opts: LightCurvePlotOptions): LightCurveDisplayOptions {
  return {
    showUnityBaseline: defaultOption(opts.showUnityBaseline, true),
    showMeanLine: defaultOption(opts.showMeanLine, false),
    title: defaultOption(opts.title, "Flux (normalized)"),
  };
}

function resolveLightCurveYQuantiles(
  yQuantiles: LightCurvePlotOptions["yQuantiles"],
): ResolvedLightCurvePlotOptions["yQuantiles"] {
  return {
    lo: defaultOption(yQuantiles?.lo, 0.01),
    hi: defaultOption(yQuantiles?.hi, 0.99),
  };
}

function defaultOption<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback;
}
