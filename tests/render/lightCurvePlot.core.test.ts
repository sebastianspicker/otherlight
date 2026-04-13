// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { LightCurvePlot } from "../../src/render/canvas2d";
import { makeMockCanvas } from "../helpers/mockCanvas";

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

  it("draw() renders a single-sample marker instead of waiting text", () => {
    const canvas = makeMockCanvas(300, 150);
    const fillTextCalls: string[] = [];
    const arcCalls: Array<{ x: number; y: number; r: number }> = [];
    (canvas as any).getContext = () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: (x: number, y: number, r: number) => {
        arcCalls.push({ x, y, r });
      },
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
      fillText: (text: string) => {
        fillTextCalls.push(text);
      },
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

    const plot = new LightCurvePlot(canvas);
    plot.push(1);
    plot.draw();

    expect(fillTextCalls).not.toContain("Awaiting data...");
    expect(arcCalls).toHaveLength(1);
  });

  it("draw() renders a flat multi-sample series instead of disappearing on zero-span flux", () => {
    const canvas = makeMockCanvas(300, 150);
    const fillTextCalls: string[] = [];
    let strokeCalls = 0;
    (canvas as any).getContext = () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      stroke: () => {
        strokeCalls += 1;
      },
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
      fillText: (text: string) => {
        fillTextCalls.push(text);
      },
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

    const plot = new LightCurvePlot(canvas, 50, { xMode: "time", trackingMode: "dynamic" });
    for (let i = 0; i < 20; i++) {
      plot.push(1, 1_000 + i);
    }
    plot.draw();

    expect(fillTextCalls).not.toContain("Awaiting data...");
    expect(strokeCalls).toBeGreaterThan(0);
  });

  it("shows full history for fixed and dynamic, and uses a trailing window only in live mode", () => {
    const canvas = makeMockCanvas(300, 150);
    const fixedPlot = new LightCurvePlot(canvas, 20, {
      xMode: "time",
      trackingMode: "fixed",
      dynamicWindowSec: 12,
    });
    const dynamicPlot = new LightCurvePlot(canvas, 20, {
      xMode: "time",
      trackingMode: "dynamic",
    });
    const livePlot = new LightCurvePlot(canvas, 20, {
      xMode: "time",
      trackingMode: "live",
      dynamicWindowSec: 2,
    });

    for (let i = 0; i < 5; i++) {
      const t = -2 + i;
      fixedPlot.push(1 - i * 0.001, t);
      dynamicPlot.push(1 - i * 0.001, i);
      livePlot.push(1 - i * 0.001, 10 + i);
    }

    expect((fixedPlot as any).getVisibleSampleBounds()).toEqual({ start: 0, end: 5 });
    expect((fixedPlot as any).getVisibleTimeDomain(0, 5)).toEqual({ tMin: -2, tMax: 2 });
    expect((dynamicPlot as any).getVisibleSampleBounds()).toEqual({ start: 0, end: 5 });
    expect((dynamicPlot as any).getVisibleTimeDomain(0, 5)).toEqual({ tMin: 0, tMax: 4 });
    expect((livePlot as any).getVisibleSampleBounds()).toEqual({ start: 2, end: 5 });
    expect((livePlot as any).getVisibleTimeDomain(2, 5)).toEqual({ tMin: 12, tMax: 14 });
  });

  it("retains only the newest capacity window without unbounded history growth", () => {
    const canvas = makeMockCanvas(300, 150);
    const plot = new LightCurvePlot(canvas, 10, {
      xMode: "time",
      trackingMode: "dynamic",
    });

    for (let i = 0; i < 1500; i++) {
      plot.push(1 - i * 1e-4, i);
    }

    expect((plot as any).getVisibleSampleBounds()).toEqual({ start: 0, end: 10 });
    expect((plot as any).getVisibleTimeDomain(0, 10)).toEqual({ tMin: 1490, tMax: 1499 });
    expect((plot as any).flux.length).toBeLessThanOrEqual(20);
    expect((plot as any).t.length).toBeLessThanOrEqual(20);
  });

  it("draw() stays safe and uses the retained newest window after over-capacity pushes", () => {
    const canvas = makeMockCanvas(300, 150);
    const moveToCalls: Array<{ x: number; y: number }> = [];
    (canvas as any).getContext = () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: (x: number, y: number) => {
        moveToCalls.push({ x, y });
      },
      lineTo: () => {},
      quadraticCurveTo: () => {},
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

    const plot = new LightCurvePlot(canvas, 12, {
      xMode: "time",
      trackingMode: "dynamic",
    });
    for (let i = 0; i < 400; i++) {
      plot.push(1 - i * 1e-4, i);
    }

    expect(() => plot.draw()).not.toThrow();
    expect(moveToCalls.length).toBeGreaterThan(0);
    expect((plot as any).getVisibleTimeDomain(0, 12)).toEqual({ tMin: 388, tMax: 399 });
  });

  it("draws overlay series, markers, badges, gap windows, and a comparison inset without throwing", () => {
    const canvas = makeMockCanvas(320, 180);
    const fillTextCalls: string[] = [];
    let strokeRectCalls = 0;
    (canvas as any).getContext = () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      ellipse: () => {},
      rect: () => {},
      strokeRect: () => {
        strokeRectCalls += 1;
      },
      clip: () => {},
      save: () => {},
      restore: () => {},
      scale: () => {},
      translate: () => {},
      rotate: () => {},
      setTransform: () => {},
      setLineDash: () => {},
      fillText: (text: string) => {
        fillTextCalls.push(text);
      },
      strokeText: () => {},
      measureText: (text: string) => ({ width: text.length * 6 }),
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

    const plot = new LightCurvePlot(canvas, 32, { xMode: "time", trackingMode: "dynamic" });
    for (let i = 0; i < 8; i++) {
      plot.push(1 - i * 1e-3, i * 60);
    }
    plot.setOverlaySeries([
      {
        id: "truth",
        label: "physical truth",
        color: "#4cc9f0",
        style: "dashed",
        samples: Array.from({ length: 8 }, (_, i) => ({ t: i * 60, flux: 1 - i * 8e-4 })),
      },
    ]);
    plot.setMarkers([{ id: "ingress", tSec: 120, label: "P ingress", color: "#8ecae6", kind: "contact" }]);
    plot.setWindowOverlays([
      { id: "gap", startSec: 90, endSec: 150, color: "rgba(239,71,111,1)", alpha: 0.12, label: "gap" },
    ]);
    plot.setBadges([{ label: "observer gaps", color: "#ef476f" }]);
    plot.setComparisonInset({
      title: "A/B delta",
      series: [{ label: "B-A", color: "#ffb703", samples: Array.from({ length: 8 }, (_, i) => ({ t: i * 60, flux: i * 1e-5 })) }],
    });

    expect(() => plot.draw()).not.toThrow();
    expect(fillTextCalls).toContain("P ingress");
    expect(fillTextCalls).toContain("observer gaps");
    expect(fillTextCalls).toContain("A/B delta");
    expect(strokeRectCalls).toBeGreaterThan(0);
  });
});
