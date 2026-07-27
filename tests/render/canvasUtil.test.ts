// @vitest-environment jsdom
/** Verifies canvas util rendering behavior and visual interpretation. */

import { describe, expect, it } from "vitest";
import { ensureHiDPICanvas } from "../../src/render/canvasUtil";
import type { SizeInfo } from "../../src/render/canvasUtil";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * jsdom does not implement layout, so getBoundingClientRect() returns all zeros.
 * We stub it to return controllable dimensions.
 */
function makeCanvasWithSize(cssW: number, cssH: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: cssW,
    height: cssH,
    top: 0,
    right: cssW,
    bottom: cssH,
    left: 0,
    toJSON() {},
  });
  return canvas;
}

/**
 * jsdom does not implement CanvasRenderingContext2D.
 * We create a minimal stub with the methods used by ensureHiDPICanvas.
 */
function makeFakeCtx(): CanvasRenderingContext2D {
  const transforms: number[][] = [];
  return {
    setTransform(...args: unknown[]) {
      transforms.push(args as number[]);
    },
    /** Expose recorded transforms for assertions. */
    get _transforms() {
      return transforms;
    },
  } as unknown as CanvasRenderingContext2D;
}

// ---------------------------------------------------------------------------
// getDevicePixelRatio (tested indirectly via ensureHiDPICanvas)
// ---------------------------------------------------------------------------

describe("getDevicePixelRatio (indirect)", () => {
  it("uses window.devicePixelRatio when available", () => {
    // jsdom typically sets devicePixelRatio to undefined or a number.
    // The function should return a positive number regardless.
    const canvas = makeCanvasWithSize(200, 100);
    const ctx = makeFakeCtx();
    const info = ensureHiDPICanvas(canvas, ctx);

    expect(typeof info.dpr).toBe("number");
    expect(info.dpr).toBeGreaterThan(0);
    expect(Number.isFinite(info.dpr)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getCanvasSizeInfo (tested indirectly via ensureHiDPICanvas)
// ---------------------------------------------------------------------------

describe("getCanvasSizeInfo (indirect)", () => {
  it("returns a SizeInfo with the expected shape", () => {
    const canvas = makeCanvasWithSize(300, 150);
    const ctx = makeFakeCtx();
    const info = ensureHiDPICanvas(canvas, ctx);

    expect(info).toHaveProperty("dpr");
    expect(info).toHaveProperty("cssW");
    expect(info).toHaveProperty("cssH");
    expect(info).toHaveProperty("pxW");
    expect(info).toHaveProperty("pxH");
  });

  it("reports the correct CSS dimensions", () => {
    const canvas = makeCanvasWithSize(400, 200);
    const ctx = makeFakeCtx();
    const info = ensureHiDPICanvas(canvas, ctx);

    expect(info.cssW).toBe(400);
    expect(info.cssH).toBe(200);
  });

  it("computes device-pixel dimensions as rounded CSS * dpr", () => {
    const canvas = makeCanvasWithSize(100, 50);
    const ctx = makeFakeCtx();
    const info = ensureHiDPICanvas(canvas, ctx);

    expect(info.pxW).toBe(Math.max(1, Math.round(100 * info.dpr)));
    expect(info.pxH).toBe(Math.max(1, Math.round(50 * info.dpr)));
  });

  it("sets canvas.width/height to the device-pixel dimensions", () => {
    const canvas = makeCanvasWithSize(120, 60);
    const ctx = makeFakeCtx();
    const info = ensureHiDPICanvas(canvas, ctx);

    expect(canvas.width).toBe(info.pxW);
    expect(canvas.height).toBe(info.pxH);
  });
});

// ---------------------------------------------------------------------------
// ensureHiDPICanvas
// ---------------------------------------------------------------------------

describe("ensureHiDPICanvas", () => {
  it("sets the context transform to scale by dpr", () => {
    const canvas = makeCanvasWithSize(200, 100);
    const ctx = makeFakeCtx();
    const info = ensureHiDPICanvas(canvas, ctx);

    const transforms = (ctx as any)._transforms;
    expect(transforms.length).toBeGreaterThanOrEqual(1);

    const last = transforms[transforms.length - 1];
    expect(last).toEqual([info.dpr, 0, 0, info.dpr, 0, 0]);
  });

  it("does not resize when called twice with unchanged layout", () => {
    const canvas = makeCanvasWithSize(200, 100);
    const ctx = makeFakeCtx();
    const first = ensureHiDPICanvas(canvas, ctx);
    const second = ensureHiDPICanvas(canvas, ctx, first);

    // The SizeInfo should be identical.
    expect(second.pxW).toBe(first.pxW);
    expect(second.pxH).toBe(first.pxH);
    expect(second.dpr).toBe(first.dpr);
  });

  it("reuses the previous size without re-reading the bounding rect when client size is stable", () => {
    const canvas = document.createElement("canvas");
    let rectCalls = 0;
    Object.defineProperty(canvas, "clientWidth", { configurable: true, get: () => 200 });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, get: () => 100 });
    canvas.getBoundingClientRect = () => {
      rectCalls += 1;
      return {
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        top: 0,
        right: 200,
        bottom: 100,
        left: 0,
        toJSON() {},
      };
    };
    const ctx = makeFakeCtx();

    const first = ensureHiDPICanvas(canvas, ctx);
    rectCalls = 0;
    const second = ensureHiDPICanvas(canvas, ctx, first);

    expect(second).toEqual(first);
    expect(rectCalls).toBe(0);
  });

  it("falls back gracefully when canvas has zero CSS size", () => {
    const canvas = makeCanvasWithSize(0, 0);
    canvas.width = 640;
    canvas.height = 480;
    const ctx = makeFakeCtx();

    // No previous SizeInfo: should use canvas.width/height as fallback.
    const info = ensureHiDPICanvas(canvas, ctx);

    expect(info.pxW).toBeGreaterThanOrEqual(1);
    expect(info.pxH).toBeGreaterThanOrEqual(1);
  });

  it("returns previous SizeInfo when CSS size is zero and prev is provided", () => {
    const canvas = makeCanvasWithSize(0, 0);
    const ctx = makeFakeCtx();

    const prev: SizeInfo = { dpr: 2, cssW: 100, cssH: 50, pxW: 200, pxH: 100 };
    const info = ensureHiDPICanvas(canvas, ctx, prev);

    expect(info).toEqual(prev);
  });
});
