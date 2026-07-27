/** Verifies light curve plot series rendering behavior and visual interpretation. */

import { describe, expect, it } from "vitest";

import {
  computeTickLayout,
  drawLightCurveSeries,
  formatTickValue,
} from "../../src/render/lightCurvePlotSeries";

type PlotCall = { method: "beginPath" | "moveTo" | "lineTo" | "stroke"; x?: number; y?: number };

function makePlotContext(): CanvasRenderingContext2D & { calls: PlotCall[] } {
  const calls: PlotCall[] = [];
  const ctx = {
    calls,
    beginPath: () => calls.push({ method: "beginPath" }),
    moveTo: (x: number, y: number) => calls.push({ method: "moveTo", x, y }),
    lineTo: (x: number, y: number) => calls.push({ method: "lineTo", x, y }),
    stroke: () => calls.push({ method: "stroke" }),
    strokeStyle: "",
    lineWidth: 0,
    lineJoin: "miter" as CanvasLineJoin,
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: PlotCall[] };
}

describe("lightCurvePlotSeries helpers", () => {
  it("computes nice tick layout boundaries", () => {
    expect(computeTickLayout(0, 100, 5)).toEqual({ start: 0, step: 20 });
    expect(computeTickLayout(3, 37, 6)).toEqual({ start: 5, step: 5 });
    expect(computeTickLayout(1, 1, 5)).toBeNull();
    expect(computeTickLayout(1, Number.POSITIVE_INFINITY, 5)).toBeNull();
  });

  it("formats tick values for compact and scientific ranges", () => {
    expect(formatTickValue(Number.NaN, 1)).toBe("");
    expect(formatTickValue(0.0000123, 10)).toBe("1.2e-5");
    expect(formatTickValue(12.34, 50)).toBe("12.3");
    expect(formatTickValue(12.34, 500)).toBe("12");
  });

  it("draws dense-index light curve points through the canvas context", () => {
    const ctx = makePlotContext();

    drawLightCurveSeries({
      ctx,
      fluxValues: [1, 0.9, 1.1],
      timeValues: [],
      visibleStart: 0,
      n: 3,
      xIndexOffset: 10,
      indexScale: 2,
      yOffset: 100,
      yScale: -10,
      xTimeOffset: 0,
      timeScale: 1,
      plotW: 100,
      haveTime: false,
      allFiniteTime: false,
    });

    expect(ctx.calls).toEqual([
      { method: "beginPath" },
      { method: "moveTo", x: 10, y: 90 },
      { method: "lineTo", x: 12, y: 91 },
      { method: "lineTo", x: 14, y: 89 },
      { method: "stroke" },
    ]);
  });
});
