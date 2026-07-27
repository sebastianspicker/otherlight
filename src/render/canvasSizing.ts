/**
 * Owns canvas Sizing support within the render layer. Keeps visual projection and drawing concerns out of simulation state.
 */
import type { SizeInfo } from "./canvasUtil";

export type CanvasSizeCacheEntry = { size: SizeInfo; dirty: boolean };

/**
 * Get current devicePixelRatio in a robust way.
 * Falls back to 1 if window is unavailable (e.g. SSR) or DPR is invalid.
 */
export function getDevicePixelRatio(): number {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  return typeof dpr === "number" && Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
}

function canvasClientSize(canvas: HTMLCanvasElement): { clientW: number; clientH: number } {
  return {
    clientW: Math.max(0, canvas.clientWidth || 0),
    clientH: Math.max(0, canvas.clientHeight || 0),
  };
}

function canvasCssSize(canvas: HTMLCanvasElement): { cssW: number; cssH: number } {
  const { clientW, clientH } = canvasClientSize(canvas);
  const rect = clientW > 0 && clientH > 0 ? null : canvas.getBoundingClientRect();
  return {
    cssW: Math.max(0, clientW || rect?.width || 0),
    cssH: Math.max(0, clientH || rect?.height || 0),
  };
}

function sizeInfoForCssSize(cssW: number, cssH: number, dpr: number): SizeInfo {
  // Use Math.round so 0.5 CSS px changes don't thrash as often as floor can.
  return {
    dpr,
    cssW,
    cssH,
    pxW: Math.max(1, Math.round(cssW * dpr)),
    pxH: Math.max(1, Math.round(cssH * dpr)),
  };
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
  const { cssW, cssH } = canvasCssSize(canvas);
  return sizeInfoForCssSize(cssW, cssH, dpr);
}

export function fallbackSizeInfo(canvas: HTMLCanvasElement, prev?: SizeInfo): SizeInfo {
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

export function applyCanvasTransform(ctx: CanvasRenderingContext2D, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function resizeCanvasIfNeeded(canvas: HTMLCanvasElement, size: SizeInfo, prev?: SizeInfo): void {
  const needResize = !prev || prev.dpr !== size.dpr || prev.pxW !== size.pxW || prev.pxH !== size.pxH;
  if (!needResize) return;
  canvas.width = size.pxW;
  canvas.height = size.pxH;
}

export function cachedSizeForDpr(
  cached: CanvasSizeCacheEntry | undefined,
  dpr: number,
): SizeInfo | undefined {
  if (!cached || cached.dirty || cached.size.cssW <= 0 || cached.size.cssH <= 0) return undefined;
  if (cached.size.dpr === dpr) return cached.size;
  cached.dirty = true;
  return undefined;
}

export function previousSizeIfLayoutStable(
  canvas: HTMLCanvasElement,
  prev: SizeInfo | undefined,
  dpr: number,
): SizeInfo | undefined {
  if (!prev) return undefined;
  const { clientW, clientH } = canvasClientSize(canvas);
  if (clientW <= 0 || clientH <= 0) return undefined;
  const candidate = sizeInfoForCssSize(clientW, clientH, dpr);
  return sizesEqual(prev, candidate) ? prev : undefined;
}

function sizesEqual(a: SizeInfo, b: SizeInfo): boolean {
  return a.dpr === b.dpr && a.cssW === b.cssW && a.cssH === b.cssH && a.pxW === b.pxW && a.pxH === b.pxH;
}

export function cssSizeUnavailable(size: SizeInfo): boolean {
  return size.cssW === 0 || size.cssH === 0;
}

export function updateCachedSize(cached: CanvasSizeCacheEntry | undefined, size: SizeInfo): void {
  if (!cached) return;
  cached.size = size;
  cached.dirty = false;
}
