// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("UI n-body mu defaults", () => {
  it("loads a strictly positive muMoon default when n-body is enabled", async () => {
    const html = readFileSync(`${process.cwd()}/index.html`, "utf8");
    document.documentElement.innerHTML = html;

    const { uiRefs } = await import("../../src/ui/refs");
    const { loadParamsIntoUI } = await import("../../src/ui/params");
    const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");

    const params = cloneParams(SCENARIO_DEFAULTS);
    if (!params.moon) throw new Error("expected default moon");

    // Force fallback path for muMoon default resolution.
    params.moon.m = undefined;
    params.dynamics = params.dynamics ?? ({} as any);
    (params.dynamics as any).nbodyPlanetMoon = {
      enabled: true,
      dtMax: 60,
      muStar: undefined,
      muPlanet: undefined,
      muMoon: undefined,
    };

    loadParamsIntoUI(params, uiRefs);

    expect(uiRefs.nbodyMuMoon.valueAsNumber).toBeGreaterThan(0);
  });
});
