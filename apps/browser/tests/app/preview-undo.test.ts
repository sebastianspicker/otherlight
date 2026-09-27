// @vitest-environment jsdom
/** Preserves fixed-preview validity and comparison scale when undoing a clear. */
import { expect, it, vi } from "vitest";
import { wireBootstrapLightCurveActions } from "../../src/presentation/playback/lightCurveActions";
import type { FixedPreviewKey } from "../../src/presentation/playback/fixedPreviewCache";
import type { LightCurvePlot } from "../../src/presentation/render/lightCurve/lightCurvePlot";
it("restores matching preview metadata without validating a later reset", () => {
  const key = { runtime: {}, settings: "settings", generation: 3 } as FixedPreviewKey;
  const state = {
    fixedPreviewKey: key as FixedPreviewKey | undefined,
    previewGeneration: 3,
    lastPlottedT: NaN,
    lastPlotMode: "physical",
    lastPlotTrackingMode: "fixed",
    fixedPlotYRange: { lo: 0.9, hi: 1.1 },
    fixedPlotYRangeMode: "physical",
  };
  const clearButton = document.createElement("button");
  const undoButton = document.createElement("button");
  const plot = {
    createHistorySnapshot: () => ({ flux: [1], timeSec: [0] }),
    clear: vi.fn(),
    setOptions: vi.fn(),
    restoreHistorySnapshot: vi.fn(),
    draw: vi.fn(),
    getAccessibleSnapshot: () => ({ sampleCount: 1 }),
  };
  wireBootstrapLightCurveActions({
    plot: plot as unknown as LightCurvePlot,
    state,
    clearButton,
    undoButton,
    exportButton: null,
    plotMode: null,
    invalidate: vi.fn(),
    setStatus: vi.fn(),
    signal: new AbortController().signal,
  });
  clearButton.click();
  expect(state.fixedPreviewKey).toBeUndefined();
  undoButton.click();
  expect(state.fixedPreviewKey).toEqual({ ...key, generation: 4 });
  expect(state.fixedPlotYRange).toEqual({ lo: 0.9, hi: 1.1 });
  clearButton.click();
  state.previewGeneration++;
  state.fixedPreviewKey = undefined;
  undoButton.click();
  expect(state.fixedPreviewKey).toBeUndefined();
  expect(plot.restoreHistorySnapshot).toHaveBeenCalledTimes(1);
});
