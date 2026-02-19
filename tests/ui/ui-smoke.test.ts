// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

describe("UI smoke", () => {
  it("wires enable handlers and slider mirroring without throwing", async () => {
    const html = readFileSync(`${process.cwd()}/index.html`, "utf8");

    document.documentElement.innerHTML = html;

    const { uiRefs } = await import("../../src/ui/refs");
    const { wireEnableHandlers, syncAllEnableStates } = await import("../../src/ui/enable");
    const { wireParamSliders } = await import("../../src/ui/sliders");
    const { loadParamsIntoUI } = await import("../../src/ui/params");
    const { SCENARIO_DEFAULTS, cloneParams } = await import("../../src/app/scenario");

    // Basic wiring (should not throw).
    wireEnableHandlers(uiRefs);
    wireParamSliders(uiRefs);

    // Load defaults into the UI, then sync enable state again.
    loadParamsIntoUI(cloneParams(SCENARIO_DEFAULTS), uiRefs);
    syncAllEnableStates(uiRefs);

    expect(document.getElementById("app")).not.toBeNull();
    expect(document.getElementById("realSystemSelect")).not.toBeNull();
    expect(document.getElementById("realSystemMeta")).not.toBeNull();
    expect(document.getElementById("simModeSelect")).not.toBeNull();
    expect(document.getElementById("runtimeModeSelect")).not.toBeNull();
    expect(document.getElementById("didHypothesisSelect")).not.toBeNull();
    expect(document.getElementById("didRevealSkyBtn")).not.toBeNull();
    expect(document.getElementById("timingHistoryVal")).not.toBeNull();
    expect(document.getElementById("ocCanvas")).not.toBeNull();
    expect(document.getElementById("ocBodySelect")).not.toBeNull();
    expect(document.getElementById("ocUnitSelect")).not.toBeNull();
    expect(document.getElementById("ocTrendModeSelect")).not.toBeNull();
    expect(document.getElementById("ocExportBtn")).not.toBeNull();
    expect(document.getElementById("ocClearBtn")).not.toBeNull();
    expect(document.getElementById("ocFitVal")).not.toBeNull();
  });
});
