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

import type { BrightnessPatch, LimbDarkeningLaw, BrowserScenarioDraft } from "../../domain/model/types";
import { clamp, toFinitePositiveOr } from "../../domain/model/units";
import {
  intensityNonNegative,
  resolveAndValidateLimbDarkening,
} from "../../domain/simulation/limbDarkeningBridge";

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
  baseRGB: [number, number, number];
  highlightRGB: [number, number, number];
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

function parseHexColor(hex: string, fallback: [number, number, number]): [number, number, number] {
  if (typeof hex !== "string") return fallback;
  const s = hex.trim();
  if (!isSixDigitHexColor(s)) return fallback;

  const v = Number.parseInt(s.slice(1), 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return [r, g, b];
}

function isSixDigitHexColor(value: string): boolean {
  if (value.length !== 7 || value.charCodeAt(0) !== 35) return false;
  for (let index = 1; index < value.length; index += 1) {
    if (!isAsciiHexDigit(value.charCodeAt(index))) return false;
  }
  return true;
}

function isAsciiHexDigit(code: number): boolean {
  const lowercase = code | 32;
  return (code >= 48 && code <= 57) || (lowercase >= 97 && lowercase <= 102);
}

function rgbToCss(rgb: [number, number, number]): string {
  const r = clamp(Math.round(rgb[0]), 0, 255);
  const g = clamp(Math.round(rgb[1]), 0, 255);
  const b = clamp(Math.round(rgb[2]), 0, 255);
  return `rgb(${r},${g},${b})`;
}

function mulRGB(rgb: [number, number, number], f: number): [number, number, number] {
  const ff = Number.isFinite(f) ? f : 0;
  return [rgb[0] * ff, rgb[1] * ff, rgb[2] * ff];
}

function lerpRGB(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const tt = clamp(t, 0, 1);
  return [a[0] * (1 - tt) + b[0] * tt, a[1] * (1 - tt) + b[1] * tt, a[2] * (1 - tt) + b[2] * tt];
}

function lawKey(law: LimbDarkeningLaw): string {
  // Quantize to stable keys; this is only for caching.
  const q = (x: number) => (Number.isFinite(x) ? x.toFixed(10) : "NaN");

  switch (law.kind) {
    case "quadratic":
      return `quadratic|${q(law.u1)}|${q(law.u2)}`;
    case "three-parameter":
      return `three|${q(law.a1)}|${q(law.a2)}|${q(law.a3)}`;
    case "four-parameter":
      return `four|${q(law.a1)}|${q(law.a2)}|${q(law.a3)}|${q(law.a4)}`;
    default: {
      const _never: never = law;
      return String(_never);
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

function chooseStops(Rpx: number): number {
  // Enough stops for smoothness, but bounded for performance.
  // For small stars, fewer stops are fine; for large stars, cap at 72.
  const n = Math.floor(Rpx / 3);
  return Math.max(18, Math.min(72, n));
}

function buildLimbDarkeningStops(params: {
  law: LimbDarkeningLaw;
  Rpx: number;
  baseRGB: [number, number, number];
  gamma: number;
  maxDisplayIntensity: number;
  nStops: number;
}): Array<{ pos: number; color: string }> {
  const { law, baseRGB } = params;
  const nStops = Math.max(8, Math.floor(params.nStops));

  // Normalize by center intensity to be robust against misconfigured coefficients.
  const Icenter = Math.max(1e-12, intensityNonNegative(1, law));
  const invIcenter = 1 / Icenter;

  const gamma = toFinitePositiveOr(params.gamma, 2.2);
  const invGamma = 1 / gamma;
  const Imax = Math.max(0.05, toFinitePositiveOr(params.maxDisplayIntensity, 1.4));

  const stops: Array<{ pos: number; color: string }> = [];

  for (let i = 0; i <= nStops; i++) {
    const r = i / nStops; // 0..1
    const mu = Math.sqrt(Math.max(0, 1 - r * r)); // mu = cos(theta)
    let I = intensityNonNegative(mu, law) * invIcenter;

    // Display clamp (visual choice; does not affect photometry).
    I = clamp(I, 0, Imax);

    // Perceptual gamma mapping (approx sRGB).
    const bright = Math.pow(I / Imax, invGamma); // 0..1
    const rgb = mulRGB(baseRGB, 0.25 + 0.9 * bright); // keep limb from going fully black
    stops.push({ pos: r, color: rgbToCss(rgb) });
  }

  return stops;
}

function buildDecorativeStops(params: {
  baseRGB: [number, number, number];
  highlightRGB: [number, number, number];
  nStops: number;
}): Array<{ pos: number; color: string }> {
  const nStops = Math.max(8, Math.floor(params.nStops));
  const { baseRGB, highlightRGB } = params;

  const stops: Array<{ pos: number; color: string }> = [];
  for (let i = 0; i <= nStops; i++) {
    const r = i / nStops;

    // Brighter near center; darker toward limb.
    const t = Math.pow(1 - r, 0.65);
    const rgb = lerpRGB(baseRGB, highlightRGB, t);
    stops.push({ pos: r, color: rgbToCss(rgb) });
  }
  return stops;
}

function applyStopsToGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  Rpx: number,
  stops: Array<{ pos: number; color: string }>,
): CanvasGradient {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rpx);
  for (const s of stops) {
    const pos = clamp(s.pos, 0, 1);
    g.addColorStop(pos, s.color);
  }
  return g;
}

function drawBrightnessPatches(params: {
  ctx: CanvasRenderingContext2D;
  centerPx: { x: number; y: number };
  pixelsPerUnit: number;
  rStar: number;
  patchStrength: number;
  patches: BrightnessPatch[];
}): void {
  const setup = brightnessPatchSetup(params);
  if (!setup) return;
  const { ctx, centerPx, pixelsPerUnit, patches } = params;

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerPx.x, centerPx.y, setup.Rpx, 0, Math.PI * 2);
  ctx.clip();

  for (const patch of patches) drawBrightnessPatch(ctx, centerPx, pixelsPerUnit, setup.strength, patch);

  ctx.restore();
}

function brightnessPatchSetup(params: {
  pixelsPerUnit: number;
  rStar: number;
  patchStrength: number;
}): { Rpx: number; strength: number } | null {
  if (!Number.isFinite(params.pixelsPerUnit) || params.pixelsPerUnit <= 0) return null;
  if (!Number.isFinite(params.rStar) || params.rStar <= 0) return null;

  const strength = clamp(params.patchStrength, 0, 1);
  return strength > 0 ? { Rpx: params.rStar * params.pixelsPerUnit, strength } : null;
}

function drawBrightnessPatch(
  ctx: CanvasRenderingContext2D,
  centerPx: { x: number; y: number },
  pixelsPerUnit: number,
  strength: number,
  patch: BrightnessPatch,
): void {
  const fillStyle = brightnessPatchFillStyle(patch, strength);
  if (!fillStyle) return;

  ctx.save();
  ctx.fillStyle = fillStyle;
  drawBrightnessPatchShape(ctx, patch, patchCenterPx(centerPx, pixelsPerUnit, patch), pixelsPerUnit);
  ctx.restore();
}

function brightnessPatchFillStyle(patch: BrightnessPatch, strength: number): string | null {
  const factor = finitePatchValue(patch.factor, 1);
  if (factor === 1) return null;

  const alpha = clamp(Math.abs(1 - factor) * 0.7 * strength, 0, 0.85);
  return factor < 1 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
}

function patchCenterPx(
  centerPx: { x: number; y: number },
  pixelsPerUnit: number,
  patch: BrightnessPatch,
): { x: number; y: number } {
  return {
    x: centerPx.x + finitePatchValue(patch.x, 0) * pixelsPerUnit,
    y: centerPx.y - finitePatchValue(patch.y, 0) * pixelsPerUnit,
  };
}

function drawBrightnessPatchShape(
  ctx: CanvasRenderingContext2D,
  patch: BrightnessPatch,
  patchCenter: { x: number; y: number },
  pixelsPerUnit: number,
): void {
  if (patch.shape === "circle") {
    drawCircleBrightnessPatch(ctx, patch, patchCenter, pixelsPerUnit);
    return;
  }
  if (patch.shape === "ellipse") drawEllipseBrightnessPatch(ctx, patch, patchCenter, pixelsPerUnit);
}

function drawCircleBrightnessPatch(
  ctx: CanvasRenderingContext2D,
  patch: BrightnessPatch,
  patchCenter: { x: number; y: number },
  pixelsPerUnit: number,
): void {
  const rr = finitePatchValue(patch.r, 0) * pixelsPerUnit;
  if (!(rr > 0)) return;
  ctx.beginPath();
  ctx.arc(patchCenter.x, patchCenter.y, rr, 0, Math.PI * 2);
  ctx.fill();
}

function drawEllipseBrightnessPatch(
  ctx: CanvasRenderingContext2D,
  patch: BrightnessPatch,
  patchCenter: { x: number; y: number },
  pixelsPerUnit: number,
): void {
  const rx = finitePatchValue(patch.rx, 0) * pixelsPerUnit;
  const ry = finitePatchValue(patch.ry, 0) * pixelsPerUnit;
  if (!(rx > 0 && ry > 0)) return;
  ctx.beginPath();
  ctx.ellipse(patchCenter.x, patchCenter.y, rx, ry, finitePatchValue(patch.angle, 0), 0, Math.PI * 2);
  ctx.fill();
}

function finitePatchValue(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

function resolveStarDiskStops(
  state: StarDiskRenderState,
  cache: StarDiskCache | undefined,
): Array<{ pos: number; color: string }> {
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

function buildStarDiskStops(state: StarDiskRenderState): Array<{ pos: number; color: string }> {
  if (state.law) {
    return buildLimbDarkeningStops({
      law: state.law,
      Rpx: state.Rpx,
      baseRGB: state.baseRGB,
      gamma: state.gamma,
      maxDisplayIntensity: state.maxDisplayIntensity,
      nStops: state.nStops,
    });
  }
  return buildDecorativeStops({
    baseRGB: state.baseRGB,
    highlightRGB: state.highlightRGB,
    nStops: state.nStops,
  });
}

function drawStarDiskFillAndPatches(
  ctx: CanvasRenderingContext2D,
  params: BrowserScenarioDraft,
  opts: StarDiskRenderOptions,
  state: StarDiskRenderState,
  stops: Array<{ pos: number; color: string }>,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(state.centerPx.x, state.centerPx.y, state.Rpx, 0, Math.PI * 2);
  ctx.fillStyle = applyStopsToGradient(ctx, state.centerPx.x, state.centerPx.y, state.Rpx, stops);
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
    rStar: state.rStar,
    patchStrength: starDiskOptionDefault(opts.patchStrength, 0.65),
    patches: patches as BrightnessPatch[],
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
