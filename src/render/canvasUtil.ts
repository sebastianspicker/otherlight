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

// ── ResizeObserver cache ─────────────────────────────────────────────────────
// Maps canvas elements to a cached SizeInfo and a dirty flag.
// The dirty flag is set by the ResizeObserver whenever the element is resized,
// causing ensureHiDPICanvas to re-measure on the next frame.
type SizeCacheEntry = { size: SizeInfo; dirty: boolean };
const _sizeCache = new WeakMap<HTMLCanvasElement, SizeCacheEntry>();

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
 * Get current devicePixelRatio in a robust way.
 * Falls back to 1 if window is unavailable (e.g. SSR) or DPR is invalid.
 */
function getDevicePixelRatio(): number {
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
function getCanvasSizeInfo(canvas: HTMLCanvasElement): SizeInfo {
  const dpr = getDevicePixelRatio();
  const clientW = Math.max(0, canvas.clientWidth || 0);
  const clientH = Math.max(0, canvas.clientHeight || 0);
  const rect = clientW > 0 && clientH > 0 ? null : canvas.getBoundingClientRect();

  const cssW = Math.max(0, clientW || rect?.width || 0);
  const cssH = Math.max(0, clientH || rect?.height || 0);

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

  // ── Fast path: ResizeObserver cache ──────────────────────────────────────
  // When the canvas is registered with attachCanvasResizeObserver, skip all
  // DOM layout reads (clientWidth / getBoundingClientRect) on frames where
  // the observer has not fired since the last measurement.
  const cached = _sizeCache.get(canvas);
  if (cached && !cached.dirty && cached.size.cssW > 0 && cached.size.cssH > 0) {
    if (cached.size.dpr === dpr) {
      // Canvas size and DPR unchanged — use cached size, skip DOM.
      const { size } = cached;
      const needResize = !prev || prev.pxW !== size.pxW || prev.pxH !== size.pxH;
      if (needResize) {
        canvas.width = size.pxW;
        canvas.height = size.pxH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return size;
    }
    // DPR changed (e.g. moved to a different monitor) — fall through to re-measure.
    cached.dirty = true;
  }

  // ── Slow path: DOM measurement ────────────────────────────────────────────
  const clientW = Math.max(0, canvas.clientWidth || 0);
  const clientH = Math.max(0, canvas.clientHeight || 0);
  if (prev && clientW > 0 && clientH > 0) {
    const pxW = Math.max(1, Math.round(clientW * dpr));
    const pxH = Math.max(1, Math.round(clientH * dpr));
    if (
      prev.dpr === dpr &&
      prev.cssW === clientW &&
      prev.cssH === clientH &&
      prev.pxW === pxW &&
      prev.pxH === pxH
    ) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return prev;
    }
  }

  const next = getCanvasSizeInfo(canvas);

  // If layout size is not available, keep previous if possible to avoid thrashing.
  if (next.cssW === 0 || next.cssH === 0) {
    const fb = fallbackSizeInfo(canvas, prev);
    // Keep transform in a known state.
    ctx.setTransform(fb.dpr, 0, 0, fb.dpr, 0, 0);
    return fb;
  }

  const needResize = !prev || prev.dpr !== next.dpr || prev.pxW !== next.pxW || prev.pxH !== next.pxH;

  if (needResize) {
    canvas.width = next.pxW;
    canvas.height = next.pxH;
  }

  // Store measured size in cache (if registered) and clear dirty flag.
  if (cached) {
    cached.size = next;
    cached.dirty = false;
  }

  // Always set to a known absolute transform so callers draw in CSS pixels.
  ctx.setTransform(next.dpr, 0, 0, next.dpr, 0, 0);

  return next;
}
