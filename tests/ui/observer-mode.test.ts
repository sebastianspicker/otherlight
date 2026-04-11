// @vitest-environment jsdom

import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

const html = readFileSync(`${process.cwd()}/index.html`, "utf8");

function installDom(): void {
  document.documentElement.innerHTML = html;
}

describe("observer mode contract", () => {
  beforeEach(() => {
    installDom();
  });

  it("locks observer inputs to the canonical viewer-aligned direction in normal mode", async () => {
    const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");
    const { uiRefs } = await import("../../src/ui/refs");
    const { loadParamsIntoUI, readUIIntoParams } = await import("../../src/ui/params");

    const params = cloneParams(SCENARIO_DEFAULTS);
    params.observer = { dir: { x: 1, y: 0, z: 0 } };
    uiRefs.uiModeSelect.value = "normal";

    loadParamsIntoUI(params, uiRefs);

    expect(uiRefs.observerX.value).toBe("0");
    expect(uiRefs.observerY.value).toBe("0");
    expect(uiRefs.observerZ.value).toBe("1");

    uiRefs.observerX.value = "1";
    uiRefs.observerY.value = "0";
    uiRefs.observerZ.value = "0";

    const next = readUIIntoParams(params, uiRefs, cloneParams(SCENARIO_DEFAULTS));

    expect(next.observer?.dir).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("preserves observer edits in expert mode", async () => {
    const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");
    const { uiRefs } = await import("../../src/ui/refs");
    const { loadParamsIntoUI, readUIIntoParams } = await import("../../src/ui/params");

    const params = cloneParams(SCENARIO_DEFAULTS);
    params.observer = { dir: { x: 1, y: 0, z: 0 } };
    uiRefs.uiModeSelect.value = "expert";

    loadParamsIntoUI(params, uiRefs);

    expect(uiRefs.observerX.value).toBe("1");
    expect(uiRefs.observerY.value).toBe("0");
    expect(uiRefs.observerZ.value).toBe("0");

    uiRefs.observerX.value = "0";
    uiRefs.observerY.value = "1";
    uiRefs.observerZ.value = "0";

    const next = readUIIntoParams(params, uiRefs, cloneParams(SCENARIO_DEFAULTS));

    expect(next.observer?.dir).toEqual({ x: 0, y: 1, z: 0 });
  });
});
