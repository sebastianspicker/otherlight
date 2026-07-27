// @vitest-environment jsdom
/** Verifies N-body mu roundtrip controls and views for accessible, consistent interaction. */

import { describe, expect, it } from "vitest";

import { G_SI } from "../../src/core/units";
import { installAppShellDocument } from "../helpers/appShell";

describe("UI n-body mu roundtrip", () => {
  it("converts fallback masses to mu when loading n-body controls", async () => {
    installAppShellDocument();

    const { uiRefs } = await import("../../src/ui/refs");
    const { loadParamsIntoUI, readUIIntoParams } = await import("../../src/ui/params");
    const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");

    const params = cloneParams(SCENARIO_DEFAULTS);
    params.star.m = 2;
    params.planet.m = 3;
    if (params.moon) params.moon.m = 4;
    params.dynamics = params.dynamics ?? ({} as any);
    (params.dynamics as any).nbodyPlanetMoon = {
      enabled: true,
      dtMax: 60,
    };

    loadParamsIntoUI(params, uiRefs);
    const next = readUIIntoParams(params, uiRefs, cloneParams(SCENARIO_DEFAULTS));
    const nbody = (next.dynamics as any).nbodyPlanetMoon;

    expect(nbody.muStar).toBeCloseTo(G_SI * 2, 12);
    expect(nbody.muPlanet).toBeCloseTo(G_SI * 3, 12);
    expect(nbody.muMoon).toBeCloseTo(G_SI * 4, 12);
  });
});
