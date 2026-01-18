// src/render/canvasUtil.ts
//
// Canvas 2D utilities for HiDPI (devicePixelRatio) sizing and stable coordinate transforms.
//
// Design goals:
// - Deterministic sizing (no mutation beyond the provided canvas/context).
// - Safe defaults when the canvas is display:none or has 0x0 CSS size.
// - Avoid accumulating transforms: always set an absolute transform.
//
// Coordinate conventions:
// - These utilities set the context transform such that 1 unit in the canvas API corresponds to
//   1 CSS pixel (after scaling by DPR), i.e. drawing uses CSS pixels.
// - Callers can then apply their own world->pixel transforms on top (or use ctx.save/restore).

export type SizeInfo = {
  /** Device pixel ratio used for backing store scaling. */
  dpr: number;

  /** Canvas size in CSS pixels as reported by layout. */
  cssW: number;
  cssH: number;

  /** Canvas backing store size in device pixels (canvas.width/height). */
  pxW: number;
  pxH: number;
};

/**
 * Get current devicePixelRatio in a robust way.
 * Falls back to 1 if window is unavailable (e.g. SSR) or DPR is invalid.
 */
export function getDevicePixelRatio(): number {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  return typeof dpr === "number" && Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
}

/**
 * Read canvas layout size and compute the backing store size for the current DPR.
 *
 * Notes:
 * - Uses getBoundingClientRect() so it reflects CSS layout size even if width/height attributes differ.
 * - Rounds device-pixel dimensions to integers (canvas backing store is integer).
 */
export function getCanvasSizeInfo(canvas: HTMLCanvasElement): SizeInfo {
  const dpr = getDevicePixelRatio();
  const rect = canvas.getBoundingClientRect();

  const cssW = Math.max(0, rect.width);
  const cssH = Math.max(0, rect.height);

  // Use Math.round so 0.5 CSS px changes don't “thrash” as often as floor can.
  const pxW = Math.max(1, Math.round(cssW * dpr));
  const pxH = Math.max(1, Math.round(cssH * dpr));

  return { dpr, cssW, cssH, pxW, pxH };
}

function fallbackSizeInfo(canvas: HTMLCanvasElement, prev?: SizeInfo): SizeInfo {
  if (prev) return prev;

  // If layout is not measurable (hidden), fall back to current backing-store size.
  const pxW = Math.max(1, canvas.width || 1);
  const pxH = Math.max(1, canvas.height || 1);

  // cssW/cssH are unknown here; we treat them as pxW/pxH in CSS pixels to keep callers sane.
  return {
    dpr: 1,
    cssW: pxW,
    cssH: pxH,
    pxW,
    pxH,
  };
}

/**
 * Ensure a canvas is sized for HiDPI rendering and set the context transform so that
 * drawing operations are expressed in CSS pixels.
 *
 * Behavior:
 * - If the canvas has 0 CSS size (e.g. hidden), it will NOT resize to 0.
 *   Instead, it returns the previous SizeInfo (if provided) or a fallback based on canvas.width/height.
 * - If resize is needed, sets canvas.width/height to device pixels and calls:
 *   ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
 *
 * Important:
 * - ctx.setTransform(...) overwrites any existing transform. This is intentional to prevent
 *   accumulating scaling on repeated calls.
 * - If callers need their own transforms, they should apply them after calling this function,
 *   ideally inside ctx.save()/restore() blocks.
 */
export function ensureHiDPICanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  prev?: SizeInfo
): SizeInfo {
  const next = getCanvasSizeInfo(canvas);

  // If layout size is not available, keep previous if possible to avoid thrashing.
  if (next.cssW === 0 || next.cssH === 0) {
    const fb = fallbackSizeInfo(canvas, prev);
    // Keep transform in a known state.
    ctx.setTransform(fb.dpr, 0, 0, fb.dpr, 0, 0);
    return fb;
  }

  const needResize =
    !prev || prev.dpr !== next.dpr || prev.pxW !== next.pxW || prev.pxH !== next.pxH;

  if (needResize) {
    canvas.width = next.pxW;
    canvas.height = next.pxH;
  }

  // Always set to a known absolute transform so callers draw in CSS pixels.
  ctx.setTransform(next.dpr, 0, 0, next.dpr, 0, 0);

  return next;
}

/**
 * Convenience helper: clear the full canvas in CSS pixel coordinates.
 *
 * This assumes ensureHiDPICanvas() was called and the transform is set to CSS pixels.
 */
export function clearCanvasCssPixels(ctx: CanvasRenderingContext2D, size: SizeInfo): void {
  ctx.clearRect(0, 0, size.cssW, size.cssH);
}

/**
 * Convenience helper: fill the full canvas in CSS pixel coordinates.
 *
 * This assumes ensureHiDPICanvas() was called and the transform is set to CSS pixels.
 */
export function fillCanvasCssPixels(
  ctx: CanvasRenderingContext2D,
  size: SizeInfo,
  fillStyle: string
): void {
  ctx.save();
  ctx.fillStyle = fillStyle;
  ctx.fillRect(0, 0, size.cssW, size.cssH);
  ctx.restore();
}
