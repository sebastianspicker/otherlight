/** Characterizes extracted presentation-only calculations and event timing lookup. */
import { describe, expect, it } from "vitest";

import { resolveLessonEventSec } from "../../src/presentation/labs/didacticsViewNavigation";
import { resolvePlotScale } from "../../src/presentation/render/lightCurve/lightCurvePlotScale";
import { buildDecorativeStops, parseHexColor } from "../../src/presentation/render/sky/starDiskColors";

describe("presentation view helpers", () => {
  it("keeps only finite lesson event times", () => {
    const timing = { planetIngressSec: 10, moonTransitCenterSec: Number.POSITIVE_INFINITY };

    expect(resolveLessonEventSec(timing, "planetIngress")).toBe(10);
    expect(resolveLessonEventSec(timing, "moonMidTransit")).toBeUndefined();
  });

  it("uses the clamped plot padding to preserve the scale transform", () => {
    const scale = resolvePlotScale(
      { lo: 2, hi: 4 },
      { yPadFrac: 2 } as Parameters<typeof resolvePlotScale>[1],
      { w: 200, h: 100, marginLeft: 10, marginTop: 5, plotW: 180, plotH: 80 },
      3,
    );

    expect(scale).toMatchObject({ lo: 0, hi: 6, yRange: 6, yScale: -80 / 6, xIndexOffset: 10 });
    expect(scale.yOf(0)).toBe(85);
    expect(scale.indexScale).toBe(90);
  });

  it("retains strict hex parsing and decorative-gradient endpoint colors", () => {
    expect(parseHexColor(" #0a0b0c ", [1, 2, 3])).toEqual([10, 11, 12]);
    expect(parseHexColor("#bad", [1, 2, 3])).toEqual([1, 2, 3]);
    expect(
      buildDecorativeStops({ baseRgb: [10, 20, 30], highlightRgb: [110, 120, 130], stopCount: 8 }),
    ).toEqual(
      expect.objectContaining({
        0: { pos: 0, color: "rgb(110,120,130)" },
        8: { pos: 1, color: "rgb(10,20,30)" },
      }),
    );
  });
});
