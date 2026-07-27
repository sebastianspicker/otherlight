// @vitest-environment jsdom
/** Verifies bootstrap O-C panel contracts across app startup, controls, and runtime integration. */

import { beforeEach, describe, expect, it } from "vitest";

import { createBootstrapOcPanelController } from "../../src/app/bootstrapOcPanel";
import { createTransitHistoryState } from "../../src/app/transitHistory";
import type { UiRefs } from "../../src/ui/refs";

describe("bootstrap O-C panel", () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="ocUndoClearBtn" hidden>Undo clear</button>';
  });

  it("restores the most recently cleared timing history", () => {
    const clear = document.createElement("button");
    const timingHistory = document.createElement("span");
    const state = { transitHistory: createTransitHistoryState() };
    state.transitHistory.planet.events.push({
      centerSec: 100,
      ocSec: 0.2,
      detectedAtSec: 101,
    });
    const refs = {
      ocCanvas: null,
      ocBodySelect: null,
      ocUnitSelect: null,
      ocTrendModeSelect: null,
      ocExportBtn: null,
      ocClearBtn: clear,
      ocStatsVal: null,
      ocFitVal: null,
      timingHistoryVal: timingHistory,
    } as unknown as UiRefs;
    const controller = createBootstrapOcPanelController({
      refs,
      state,
      warnEl: null,
      getSuccessMessage: () => "Ready",
    });

    controller.wireOcControls();
    clear.click();

    const undo = document.getElementById("ocUndoClearBtn") as HTMLButtonElement;
    expect(state.transitHistory.planet.events).toHaveLength(0);
    expect(timingHistory.textContent).toBe("transit events: none");
    expect(undo.hidden).toBe(false);

    undo.click();

    expect(state.transitHistory.planet.events).toHaveLength(1);
    expect(state.transitHistory.planet.events[0]?.centerSec).toBe(100);
    expect(timingHistory.textContent).toContain("planet n=1");
    expect(undo.hidden).toBe(true);
  });
});
