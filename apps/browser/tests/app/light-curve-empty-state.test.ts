/** Verifies that the empty light-curve instruction stays inside a phone-width plot. */
import { describe, expect, it, vi } from "vitest";

import { drawLightCurvePlot } from "../../src/presentation/render/lightCurve/lightCurvePlotRenderer";
import type { ResolvedLightCurvePlotOptions } from "../../src/presentation/render/lightCurve/lightCurvePlotTypes";

describe("light-curve empty state", () => {
  it("wraps its instruction to the available plot width", () => {
    const drawnText: Array<{ text: string; x: number; y: number }> = [];
    const measureText = vi.fn((text: string) => ({ width: text.length * 7 }) as TextMetrics);
    const ctx = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn((text: string, x: number, y: number) => drawnText.push({ text, x, y })),
      measureText,
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      clientHeight: 220,
      clientWidth: 320,
      height: 220,
      width: 320,
    } as HTMLCanvasElement;
    const opts: ResolvedLightCurvePlotOptions = {
      dynamicWindowSamples: 300,
      dynamicWindowSec: 180,
      showMeanLine: false,
      showUnityBaseline: true,
      title: "Flux (normalized)",
      trackingMode: "fixed",
      xMode: "index",
      yPadFrac: 0.15,
      yQuantiles: { lo: 0.01, hi: 0.99 },
      yScaleMode: "robust",
    };

    drawLightCurvePlot({
      canvas,
      ctx,
      opts,
      size: { cssH: 220, cssW: 320, dpr: 1, pxH: 220, pxW: 320 },
      state: {
        capacity: 10,
        earliestFiniteTime: Number.NaN,
        earliestFiniteTimeIndex: -1,
        finiteTimeCount: 0,
        flux: [],
        latestFiniteTime: Number.NaN,
        latestFiniteTimeIndex: -1,
        startIndex: 0,
        t: [],
      },
      visibleWindow: { end: 0, start: 0, timeDomain: null },
    });

    const instruction = drawnText.slice(1);
    expect(instruction.length).toBeGreaterThan(1);
    expect(instruction.map(({ text }) => text).join(" ")).toBe(
      "No samples yet \u2014 start the simulation or jump to a transit.",
    );
    expect(instruction.every(({ text }) => measureText(text).width <= 222)).toBe(true);
  });
});
