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
//
// Performance:
// - Call attachCanvasResizeObserver(canvas) once at setup and hold the returned cleanup fn.
//   This eliminates forced-layout DOM reads (clientWidth/getBoundingClientRect) on every
//   frame by caching the last-known size and only re-measuring when the canvas is resized.

import {
  applyCanvasTransform,
  cachedSizeForDpr,
  cssSizeUnavailable,
  fallbackSizeInfo,
  getCanvasSizeInfo,
  getDevicePixelRatio,
  previousSizeIfLayoutStable,
  resizeCanvasIfNeeded,
  updateCachedSize,
  type CanvasSizeCacheEntry,
} from "./canvasSizing";

// ── ResizeObserver cache ─────────────────────────────────────────────────────
// Maps canvas elements to a cached SizeInfo and a dirty flag.
// The dirty flag is set by the ResizeObserver whenever the element is resized,
// causing ensureHiDPICanvas to re-measure on the next frame.
const _sizeCache = new WeakMap<HTMLCanvasElement, CanvasSizeCacheEntry>();

/**
 * Attach a ResizeObserver to a canvas so that {@link ensureHiDPICanvas} can skip
 * forced-layout DOM reads (clientWidth / getBoundingClientRect) on frames where the
 * canvas has not been resized.
 *
 * Call once during setup and hold the returned cleanup function. Invoke the cleanup
 * function when the canvas is unmounted to disconnect the observer.
 *
 * If ResizeObserver is unavailable (SSR, legacy browsers), returns a no-op and
 * ensureHiDPICanvas falls back to the existing DOM-read path.
 *
 * @example
 * const detach = attachCanvasResizeObserver(canvas);
 * // … on teardown:
 * detach();
 */
export function attachCanvasResizeObserver(canvas: HTMLCanvasElement): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  if (_sizeCache.has(canvas)) return () => {}; // already attached

  _sizeCache.set(canvas, {
    size: { dpr: 1, cssW: 0, cssH: 0, pxW: 1, pxH: 1 },
    dirty: true,
  });

  const ro = new ResizeObserver(() => {
    const entry = _sizeCache.get(canvas);
    if (entry) entry.dirty = true;
  });
  ro.observe(canvas);

  return () => {
    ro.disconnect();
    _sizeCache.delete(canvas);
  };
}

// ── Public types ─────────────────────────────────────────────────────────────

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
 * Ensure a canvas is sized for HiDPI rendering and set the context transform so that
 * drawing operations are expressed in CSS pixels.
 *
 * Behavior:
 * - If the canvas has 0 CSS size (e.g. hidden), it will NOT resize to 0.
 *   Instead, it returns the previous SizeInfo (if provided) or a fallback based on canvas.width/height.
 * - If resize is needed, sets canvas.width/height to device pixels and calls:
 *   ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
 *
 * Performance:
 * - If {@link attachCanvasResizeObserver} has been called for this canvas, DOM layout reads
 *   are skipped entirely on frames where the canvas was not resized (dirty flag clear).
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
  prev?: SizeInfo,
): SizeInfo {
  const dpr = getDevicePixelRatio();
  const cached = _sizeCache.get(canvas);

  const cachedSize = cachedSizeForDpr(cached, dpr);
  if (cachedSize) {
    resizeCanvasIfNeeded(canvas, cachedSize, prev);
    applyCanvasTransform(ctx, dpr);
    return cachedSize;
  }

  const stablePreviousSize = previousSizeIfLayoutStable(canvas, prev, dpr);
  if (stablePreviousSize) {
    applyCanvasTransform(ctx, dpr);
    return stablePreviousSize;
  }

  const next = getCanvasSizeInfo(canvas);

  if (cssSizeUnavailable(next)) {
    const fb = fallbackSizeInfo(canvas, prev);
    applyCanvasTransform(ctx, fb.dpr);
    return fb;
  }

  resizeCanvasIfNeeded(canvas, next, prev);
  updateCachedSize(cached, next);
  applyCanvasTransform(ctx, next.dpr);

  return next;
}
