import { describe, expect, it } from "vitest";
import {
  buildVisualizationAccessibleSnapshot,
  formatLightCurveAccessibleSummary,
} from "../../src/ui/visualizationAccessible";

describe("visualization accessible snapshots", () => {
  it("describes geometry and plot data without relying on the canvas", () => {
    const snapshot = buildVisualizationAccessibleSnapshot({
      params: { star: { r: 10 }, planet: { r: 1, orbit: {} as never } } as never,
      step: {
        renderSignals: { visibilityFractions: { planet: 0.75, moon: 0.5 } },
        debug: { nOcculters: 1 },
      } as never,
      timeSec: 12,
      plotMode: "measured",
      plot: { sampleCount: 3, timeMinSec: 0, timeMaxSec: 12, fluxMin: 0.98, fluxMax: 1 },
    });

    expect(snapshot.sceneGeometry).toContain("1 body is occulting");
    expect(snapshot.sceneGeometry).toContain("Moon disabled");
    expect(formatLightCurveAccessibleSummary(snapshot)).toContain("measured flux");
    expect(formatLightCurveAccessibleSummary(snapshot)).toContain("0.980000 to 1.000000");
  });
});
