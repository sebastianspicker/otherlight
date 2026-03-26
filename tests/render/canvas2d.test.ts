// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { Canvas2DRenderer, LightCurvePlot } from "../../src/render/canvas2d";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Create a canvas element with a stubbed getContext("2d") that returns
 * a minimal mock context. jsdom does not implement the Canvas 2D API,
 * so we provide just enough for the constructors to succeed.
 */
function makeMockCanvas(w = 200, h = 100): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  // Stub getBoundingClientRect so ensureHiDPICanvas sees non-zero CSS size.
  canvas.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: w,
    height: h,
    top: 0,
    right: w,
    bottom: h,
    left: 0,
    toJSON() {},
  });

  // Stub getContext to return a fake CanvasRenderingContext2D.
  (canvas as any).getContext = () => ({
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
    ellipse: () => {},
    rect: () => {},
    clip: () => {},
    save: () => {},
    restore: () => {},
    scale: () => {},
    translate: () => {},
    rotate: () => {},
    setTransform: () => {},
    setLineDash: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    putImageData: () => {},
    canvas,
    lineWidth: 1,
    strokeStyle: "#000",
    fillStyle: "#000",
    globalAlpha: 1,
    font: "10px sans-serif",
    lineJoin: "miter" as CanvasLineJoin,
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
  });

  return canvas;
}

// ---------------------------------------------------------------------------
// Canvas2DRenderer
// ---------------------------------------------------------------------------

describe("Canvas2DRenderer", () => {
  it("is exported as a constructor function", () => {
    expect(typeof Canvas2DRenderer).toBe("function");
  });

  it("constructs without throwing when given a canvas with a mock 2d context", () => {
    const canvas = makeMockCanvas();
    expect(() => new Canvas2DRenderer(canvas)).not.toThrow();
  });

  it("throws when the canvas returns null from getContext", () => {
    const canvas = makeMockCanvas();
    (canvas as any).getContext = () => null;
    expect(() => new Canvas2DRenderer(canvas)).toThrow("2D context unavailable");
  });
});

// ---------------------------------------------------------------------------
// LightCurvePlot
// ---------------------------------------------------------------------------

describe("LightCurvePlot", () => {
  it("is exported as a constructor function", () => {
    expect(typeof LightCurvePlot).toBe("function");
  });

  it("constructs without throwing when given a canvas element", () => {
    const canvas = makeMockCanvas();
    expect(() => new LightCurvePlot(canvas)).not.toThrow();
  });

  it("push() accepts numeric values without throwing", () => {
    const canvas = makeMockCanvas();
    const plot = new LightCurvePlot(canvas);
    expect(() => {
      plot.push(1.0);
      plot.push(0.998);
      plot.push(0.995);
    }).not.toThrow();
  });

  it("clear() resets internal state so subsequent draw has no data", () => {
    const canvas = makeMockCanvas();
    const plot = new LightCurvePlot(canvas);

    // Push some samples
    plot.push(1.0);
    plot.push(0.99);
    plot.push(0.98);

    // After clear, the plot should have no samples.
    plot.clear();

    // draw() should not throw even with zero samples after clear.
    expect(() => plot.draw()).not.toThrow();
  });

  it("push() ignores non-finite values", () => {
    const canvas = makeMockCanvas();
    const plot = new LightCurvePlot(canvas);

    // These should be silently ignored (no throw).
    plot.push(NaN);
    plot.push(Infinity);
    plot.push(-Infinity);

    // Only finite values should have been retained. After pushing
    // only non-finite values, clear + draw should still be safe.
    plot.clear();
    expect(() => plot.draw()).not.toThrow();
  });

  it("draw() does not throw with enough samples for a line", () => {
    const canvas = makeMockCanvas(300, 150);
    const plot = new LightCurvePlot(canvas);

    for (let i = 0; i < 50; i++) {
      plot.push(1.0 - i * 0.001);
    }

    expect(() => plot.draw()).not.toThrow();
  });
});
