// @vitest-environment jsdom
/** Verifies N-body perturber mu floor controls and views for accessible, consistent interaction. */

import { describe, expect, it } from "vitest";
import { installAppShellDocument } from "../helpers/appShell";

describe("UI n-body perturber mu floor", () => {
  it("enforces positive perturber mu when enabled", async () => {
    installAppShellDocument();

    const { uiRefs } = await import("../../src/ui/refs");
    const { loadParamsIntoUI, readUIIntoParams } = await import("../../src/ui/params");
    const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");

    const params = cloneParams(SCENARIO_DEFAULTS);

    loadParamsIntoUI(params, uiRefs);

    uiRefs.moonEnabled.checked = true;
    uiRefs.nbodyEnabled.checked = true;
    uiRefs.pert1Enabled.checked = true;
    uiRefs.pert1Mu.value = "0";

    const next = readUIIntoParams(params, uiRefs, cloneParams(SCENARIO_DEFAULTS));
    const nbody = (next.dynamics as any).nbodyPlanetMoon;
    const p1 = nbody.perturbers?.[0];

    expect(typeof p1?.mu).toBe("number");
    expect(p1.mu).toBeGreaterThan(0);
  });
});
