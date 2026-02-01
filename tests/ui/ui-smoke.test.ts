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
  });
});
