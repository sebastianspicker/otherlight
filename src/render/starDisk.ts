// src/render/starDisk.ts
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
//   patches are rendered as a qualitative overlay that matches the *intent* of the photometry patches.
//
// Dependencies:
// - core/types.ts defines SystemParams + limb-darkening models. [project-local]
// - photometry/limbDarkening.ts implements the intensity laws and optional plausibility validation. [project-local]

import type { BrightnessPatch, LimbDarkeningLaw, SystemParams } from "../core/types";
import { clamp, toFinitePositiveOr } from "../core/units";
import { intensityNonNegative, resolveAndValidateLimbDarkening } from "../photometry/limbDarkening";

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

export class StarDiskCache {
  // Store radial stop lists (position + color string) keyed by parameters.
  private stops = new Map<string, Array<{ pos: number; color: string }>>();

  clear(): void {
    this.stops.clear();
  }

  getStops(key: string): Array<{ pos: number; color: string }> | undefined {
    return this.stops.get(key);
  }

  setStops(key: string, stops: Array<{ pos: number; color: string }>): void {
    this.stops.set(key, stops);
  }
}

function parseHexColor(hex: string, fallback: [number, number, number]): [number, number, number] {
  if (typeof hex !== "string") return fallback;
  const s = hex.trim();
  const m = /^#([0-9a-fA-F]{6})$/.exec(s);
  if (!m) return fallback;

  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return [r, g, b];
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

function resolveLawFromParams(params: SystemParams): LimbDarkeningLaw | undefined {
  const model = params.star.photometry?.limbDarkeningModel;
  if (!model) return undefined;

  // Uses photometry-layer resolver which can apply model.constraints validation.
  // Note: The returned law is structurally compatible with core/types LimbDarkeningLaw.
  const resolved = resolveAndValidateLimbDarkening({ model, bandpass: model.bandpass });
  return resolved as unknown as LimbDarkeningLaw | undefined;
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
  const Icenter = Math.max(1e-12, intensityNonNegative(1, law as any));
  const invIcenter = 1 / Icenter;

  const gamma = toFinitePositiveOr(params.gamma, 2.2);
  const invGamma = 1 / gamma;
  const Imax = Math.max(0.05, toFinitePositiveOr(params.maxDisplayIntensity, 1.4));

  const stops: Array<{ pos: number; color: string }> = [];

  for (let i = 0; i <= nStops; i++) {
    const r = i / nStops; // 0..1
    const mu = Math.sqrt(Math.max(0, 1 - r * r)); // mu = cos(theta)
    let I = intensityNonNegative(mu, law as any) * invIcenter;

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
  const { ctx, centerPx, pixelsPerUnit, rStar } = params;

  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) return;
  if (!Number.isFinite(rStar) || rStar <= 0) return;

  const strength = clamp(params.patchStrength, 0, 1);
  if (strength <= 0) return;

  // Clip patches to stellar disk (projected).
  const Rpx = rStar * pixelsPerUnit;

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerPx.x, centerPx.y, Rpx, 0, Math.PI * 2);
  ctx.clip();

  for (const p of params.patches) {
    if (!p || typeof p !== "object") continue;

    const factor = typeof p.factor === "number" && Number.isFinite(p.factor) ? p.factor : 1;
    if (!Number.isFinite(factor) || factor === 1) continue;

    // Map patch factor to an overlay alpha.
    // This is NOT a physically exact multiply, but a qualitative visualization:
    // - factor < 1 => darker (black overlay)
    // - factor > 1 => brighter (white overlay)
    const dark = factor < 1;
    const delta = Math.abs(1 - factor);
    const alpha = clamp(delta * 0.7 * strength, 0, 0.85);

    ctx.save();
    ctx.fillStyle = dark ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;

    const xPx = centerPx.x + (Number.isFinite(p.x) ? p.x : 0) * pixelsPerUnit;
    const yPx = centerPx.y + (Number.isFinite(p.y) ? p.y : 0) * pixelsPerUnit;

    if (p.shape === "circle") {
      const rr = (Number.isFinite(p.r) ? (p.r as number) : 0) * pixelsPerUnit;
      if (rr > 0) {
        ctx.beginPath();
        ctx.arc(xPx, yPx, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (p.shape === "ellipse") {
      const rx = (Number.isFinite(p.rx) ? (p.rx as number) : 0) * pixelsPerUnit;
      const ry = (Number.isFinite(p.ry) ? (p.ry as number) : 0) * pixelsPerUnit;
      if (rx > 0 && ry > 0) {
        const ang = Number.isFinite(p.angle) ? (p.angle as number) : 0;
        ctx.beginPath();
        ctx.ellipse(xPx, yPx, rx, ry, ang, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  ctx.restore();
}

/**
 * Draw the star disk at the given center using params.star.r and optional photometry config.
 *
 * The caller supplies pixelsPerUnit and centerPx so this module stays renderer-agnostic.
 */
export function drawStarDisk(
  ctx: CanvasRenderingContext2D,
  params: SystemParams,
  opts: StarDiskRenderOptions,
): void {
  const centerPx = opts.centerPx;
  const pixelsPerUnit = toFinitePositiveOr(opts.pixelsPerUnit, 1);

  const rStar = toFinitePositiveOr(params.star?.r, 1);
  const Rpx = rStar * pixelsPerUnit;

  const baseRGB = parseHexColor(opts.baseColor ?? "#f2a33a", [242, 163, 58]);
  const highlightRGB = parseHexColor(opts.highlightColor ?? "#ffe1a6", [255, 225, 166]);

  const gamma = toFinitePositiveOr(opts.gamma, 2.2);
  const maxDisplayIntensity = toFinitePositiveOr(opts.maxDisplayIntensity, 1.4);

  const useLD = opts.useLimbDarkening ?? true;
  const law = useLD ? resolveLawFromParams(params) : undefined;

  const nStops = Math.max(8, Math.floor(opts.nStops ?? chooseStops(Rpx)));

  // Build or fetch cached stops
  let stops: Array<{ pos: number; color: string }> | undefined;

  const cache = opts.cache;
  if (cache) {
    const key = law
      ? `ld|${lawKey(law)}|R:${Math.round(Rpx)}|base:${rgbToCss(baseRGB)}|g:${gamma.toFixed(3)}|I:${maxDisplayIntensity.toFixed(3)}|n:${nStops}`
      : `decor|R:${Math.round(Rpx)}|base:${rgbToCss(baseRGB)}|hi:${rgbToCss(highlightRGB)}|n:${nStops}`;

    stops = cache.getStops(key);
    if (!stops) {
      stops = law
        ? buildLimbDarkeningStops({ law, Rpx, baseRGB, gamma, maxDisplayIntensity, nStops })
        : buildDecorativeStops({ baseRGB, highlightRGB, nStops });
      cache.setStops(key, stops);
    }
  } else {
    stops = law
      ? buildLimbDarkeningStops({ law, Rpx, baseRGB, gamma, maxDisplayIntensity, nStops })
      : buildDecorativeStops({ baseRGB, highlightRGB, nStops });
  }

  // Paint disk
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerPx.x, centerPx.y, Rpx, 0, Math.PI * 2);

  const grad = applyStopsToGradient(ctx, centerPx.x, centerPx.y, Rpx, stops);
  ctx.fillStyle = grad;
  ctx.fill();

  // Optional patch overlay
  const showPatches = opts.showPatches ?? true;
  if (showPatches) {
    const patches = params.star.photometry?.brightnessPatches;
    if (Array.isArray(patches) && patches.length > 0) {
      drawBrightnessPatches({
        ctx,
        centerPx,
        pixelsPerUnit,
        rStar,
        patchStrength: opts.patchStrength ?? 0.65,
        patches: patches as BrightnessPatch[],
      });
    }
  }

  // Outline
  if (opts.drawOutline ?? true) {
    ctx.strokeStyle = opts.outlineStyle?.strokeStyle ?? "rgba(0,0,0,0.25)";
    ctx.lineWidth = toFinitePositiveOr(opts.outlineStyle?.lineWidth, 1);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Convenience helper: compute star radius in CSS pixels.
 */
export function starRadiusPx(params: SystemParams, pixelsPerUnit: number): number {
  const ppu = toFinitePositiveOr(pixelsPerUnit, 1);
  const rStar = toFinitePositiveOr(params.star?.r, 1);
  return rStar * ppu;
}
