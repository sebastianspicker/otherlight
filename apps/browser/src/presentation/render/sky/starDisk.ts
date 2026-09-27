/** Renders the projected stellar disk and its photometric surface appearance. */
//
// Star disk renderer (Canvas2D).
//
// Purpose:
// - Visualize the stellar disk with a limb-darkening-consistent radial intensity profile,
//   using the SAME law definitions and (optional) validation rules as the photometry layer.
// - Optionally visualize brightness patches (spots/faculae) from params.star.photometry.brightnessPatches.
//
// Important:
// - Visualization only: nothing here feeds back into physics or flux computations.
// - Canvas blending cannot truly implement multiplicative intensity maps in a physically exact way;
//   patches are rendered as a qualitative overlay that matches the intent of the photometry patches.
//
// Dependencies:
// - core/types.ts defines BrowserScenarioDraft + limb-darkening models. [project-local]
// - photometry/limbDarkening.ts implements the intensity laws and optional plausibility validation. [project-local]

import type { LimbDarkeningLaw, BrowserScenarioDraft } from "../../../domain/model/types";
import { toFinitePositiveOr } from "../../../domain/model/units";
import { resolveAndValidateLimbDarkening } from "../../../domain/simulation/limbDarkeningBridge";
import { drawBrightnessPatches } from "./starDiskBrightnessPatches";
import {
  applyStopsToGradient,
  buildDecorativeStops,
  buildLimbDarkeningStops,
  chooseStops,
  lawKey,
  parseHexColor,
  rgbToCss,
  type GradientStop,
  type Rgb,
} from "./starDiskColors";

export type StarDiskRenderOptions = {
  /**
   * Center of the star disk in CSS pixels (canvas coordinate system after HiDPI transform).
   */
  centerPx: { x: number; y: number };

  /**
   * World-to-pixel scale used by the main renderer (e.g. Canvas2DRenderer.pixelsPerUnit).
   */
  pixelsPerUnit: number;

  /**
   * If true, use params.star.photometry.limbDarkeningModel when present.
   * If false, fall back to a simple decorative gradient.
   */
  useLimbDarkening?: boolean;

  /**
   * Optional cache to reuse computed radial stops across frames.
   */
  cache?: StarDiskCache;

  /**
   * Base star color (hex "#rrggbb"). Default is a warm orange.
   */
  baseColor?: string;

  /**
   * Optional slightly brighter "highlight" tone to use for the decorative fallback.
   * If omitted, a derived value is used.
   */
  highlightColor?: string;

  /**
   * Gamma correction for perceived brightness mapping (sRGB-ish).
   * The intensity law is linear in intensity; the display is roughly gamma-encoded.
   * Default: 2.2.
   */
  gamma?: number;

  /**
   * Upper clamp for intensity-to-brightness mapping (display choice).
   * Default: 1.4.
   */
  maxDisplayIntensity?: number;

  /**
   * Whether to draw an outline around the star disk.
   */
  drawOutline?: boolean;

  /**
   * Outline style.
   */
  outlineStyle?: { strokeStyle?: string; lineWidth?: number };

  /**
   * Visualize brightness patches (spots/faculae) if configured in params.star.photometry.
   */
  showPatches?: boolean;

  /**
   * Patch overlay strength (0..1). Larger means patches appear stronger.
   * Default: 0.65.
   */
  patchStrength?: number;

  /**
   * Override number of radial stops used for gradient construction.
   * When undefined, the renderer selects based on pixel radius.
   */
  nStops?: number;
};

type StarDiskRenderState = {
  centerPx: { x: number; y: number };
  pixelsPerUnit: number;
  rStar: number;
  Rpx: number;
  baseRGB: Rgb;
  highlightRGB: Rgb;
  gamma: number;
  maxDisplayIntensity: number;
  law: LimbDarkeningLaw | undefined;
  nStops: number;
};

export class StarDiskCache {
  // Store radial stop lists (position + color string) keyed by parameters.
  // Bounded to prevent unbounded memory growth.
  private static readonly MAX_ENTRIES = 64;
  private stops = new Map<string, Array<{ pos: number; color: string }>>();

  clear(): void {
    this.stops.clear();
  }

  getStops(key: string): Array<{ pos: number; color: string }> | undefined {
    return this.stops.get(key);
  }

  setStops(key: string, stops: Array<{ pos: number; color: string }>): void {
    this.stops.set(key, stops);
    // Evict oldest entries if cache exceeds bound.
    // Map iteration order follows insertion order (ES2015+).
    if (this.stops.size > StarDiskCache.MAX_ENTRIES) {
      const firstKey = this.stops.keys().next().value;
      if (firstKey !== undefined) this.stops.delete(firstKey);
    }
  }
}

function resolveLawFromParams(params: BrowserScenarioDraft): LimbDarkeningLaw | undefined {
  const model = params.star.photometry?.limbDarkeningModel;
  if (!model) return undefined;

  // Uses photometry-layer resolver which can apply model.constraints validation.
  // Note: The returned law is structurally compatible with core/types LimbDarkeningLaw.
  const resolved = resolveAndValidateLimbDarkening({ model, bandpass: model.bandpass });
  return resolved;
}

function starDiskOptionDefault<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback;
}

function resolveStarDiskRenderState(
  params: BrowserScenarioDraft,
  opts: StarDiskRenderOptions,
): StarDiskRenderState {
  const pixelsPerUnit = toFinitePositiveOr(opts.pixelsPerUnit, 1);
  const rStar = toFinitePositiveOr(params.star?.r, 1);
  const Rpx = rStar * pixelsPerUnit;
  const useLD = starDiskOptionDefault(opts.useLimbDarkening, true);
  return {
    centerPx: opts.centerPx,
    pixelsPerUnit,
    rStar,
    Rpx,
    baseRGB: parseHexColor(starDiskOptionDefault(opts.baseColor, "#f2a33a"), [242, 163, 58]),
    highlightRGB: parseHexColor(starDiskOptionDefault(opts.highlightColor, "#ffe1a6"), [255, 225, 166]),
    gamma: toFinitePositiveOr(opts.gamma, 2.2),
    maxDisplayIntensity: toFinitePositiveOr(opts.maxDisplayIntensity, 1.4),
    law: useLD ? resolveLawFromParams(params) : undefined,
    nStops: Math.max(8, Math.floor(starDiskOptionDefault(opts.nStops, chooseStops(Rpx)))),
  };
}

function resolveStarDiskStops(state: StarDiskRenderState, cache: StarDiskCache | undefined): GradientStop[] {
  if (!cache) return buildStarDiskStops(state);

  const key = starDiskStopsCacheKey(state);
  let stops = cache.getStops(key);
  if (!stops) {
    stops = buildStarDiskStops(state);
    cache.setStops(key, stops);
  }
  return stops;
}

function starDiskStopsCacheKey(state: StarDiskRenderState): string {
  const base = rgbToCss(state.baseRGB);
  if (state.law) {
    return [
      "ld",
      lawKey(state.law),
      `R:${Math.round(state.Rpx)}`,
      `base:${base}`,
      `g:${state.gamma.toFixed(3)}`,
      `I:${state.maxDisplayIntensity.toFixed(3)}`,
      `n:${state.nStops}`,
    ].join("|");
  }
  return [
    "decor",
    `R:${Math.round(state.Rpx)}`,
    `base:${base}`,
    `hi:${rgbToCss(state.highlightRGB)}`,
    `n:${state.nStops}`,
  ].join("|");
}

function buildStarDiskStops(state: StarDiskRenderState): GradientStop[] {
  if (state.law) {
    return buildLimbDarkeningStops({
      law: state.law,
      radiusPx: state.Rpx,
      baseRgb: state.baseRGB,
      gamma: state.gamma,
      maxDisplayIntensity: state.maxDisplayIntensity,
      stopCount: state.nStops,
    });
  }
  return buildDecorativeStops({
    baseRgb: state.baseRGB,
    highlightRgb: state.highlightRGB,
    stopCount: state.nStops,
  });
}

function drawStarDiskFillAndPatches(
  ctx: CanvasRenderingContext2D,
  params: BrowserScenarioDraft,
  opts: StarDiskRenderOptions,
  state: StarDiskRenderState,
  stops: GradientStop[],
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(state.centerPx.x, state.centerPx.y, state.Rpx, 0, Math.PI * 2);
  ctx.fillStyle = applyStopsToGradient(ctx, state.centerPx, state.Rpx, stops);
  ctx.fill();
  drawStarDiskPatches(ctx, params, opts, state);
  ctx.restore();
}

function drawStarDiskPatches(
  ctx: CanvasRenderingContext2D,
  params: BrowserScenarioDraft,
  opts: StarDiskRenderOptions,
  state: StarDiskRenderState,
): void {
  if (!starDiskOptionDefault(opts.showPatches, true)) return;

  const patches = params.star.photometry?.brightnessPatches;
  if (!(Array.isArray(patches) && patches.length > 0)) return;

  drawBrightnessPatches({
    ctx,
    centerPx: state.centerPx,
    pixelsPerUnit: state.pixelsPerUnit,
    starRadius: state.rStar,
    patchStrength: starDiskOptionDefault(opts.patchStrength, 0.65),
    patches,
  });
}

function drawStarDiskOutline(
  ctx: CanvasRenderingContext2D,
  opts: StarDiskRenderOptions,
  state: StarDiskRenderState,
): void {
  if (!starDiskOptionDefault(opts.drawOutline, true)) return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(state.centerPx.x, state.centerPx.y, state.Rpx, 0, Math.PI * 2);
  ctx.strokeStyle = opts.outlineStyle?.strokeStyle ?? "rgba(0,0,0,0.25)";
  ctx.lineWidth = toFinitePositiveOr(opts.outlineStyle?.lineWidth, 1);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw the star disk at the given center using params.star.r and optional photometry config.
 *
 * The caller supplies pixelsPerUnit and centerPx so this module stays renderer-agnostic.
 */
export function drawStarDisk(
  ctx: CanvasRenderingContext2D,
  params: BrowserScenarioDraft,
  opts: StarDiskRenderOptions,
): void {
  const state = resolveStarDiskRenderState(params, opts);
  const stops = resolveStarDiskStops(state, opts.cache);
  drawStarDiskFillAndPatches(ctx, params, opts, state, stops);
  drawStarDiskOutline(ctx, opts, state);
}

/**
 * Convenience helper: compute star radius in CSS pixels.
 */
export function starRadiusPx(params: BrowserScenarioDraft, pixelsPerUnit: number): number {
  const ppu = toFinitePositiveOr(pixelsPerUnit, 1);
  const rStar = toFinitePositiveOr(params.star?.r, 1);
  return rStar * ppu;
}
