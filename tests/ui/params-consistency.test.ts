// @vitest-environment jsdom
/** Verifies params consistency controls and views for accessible, consistent interaction. */

import { describe, expect, it } from "vitest";
import { installAppShellDocument } from "../helpers/appShell";
import scenarioJson from "../../src/config/scenario.default.json";

describe("UI param consistency", () => {
  it("clears moon-only photometry and n-body state when the moon is disabled", async () => {
    installAppShellDocument();

    const { uiRefs } = await import("../../src/ui/refs");
    const { loadParamsIntoUI, readUIIntoParams } = await import("../../src/ui/params");
    const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");

    const params = cloneParams(SCENARIO_DEFAULTS);
    params.star.photometry = {
      ...(params.star.photometry ?? {}),
      moonPhaseCurve: {
        enabled: true,
        reflAmp: 0.2,
        thermAmp: 0.1,
        lambertian: true,
      },
    };
    params.dynamics = {
      ...(params.dynamics ?? {}),
      nbodyPlanetMoon: {
        enabled: true,
        muStar: 1,
        muPlanet: 1,
        muMoon: 1,
        dtMax: 60,
        softening: 0,
      },
    };

    loadParamsIntoUI(params, uiRefs);
    uiRefs.moonEnabled.checked = false;
    uiRefs.nbodyEnabled.checked = true;

    const next = readUIIntoParams(params, uiRefs, cloneParams(SCENARIO_DEFAULTS));

    expect(next.moon).toBeUndefined();
    expect(next.star.photometry?.moonPhaseCurve).toBeUndefined();
    expect(next.dynamics?.nbodyPlanetMoon).toBeUndefined();
  });

  it("preserves advanced stellar variability fields across UI round trips", async () => {
    installAppShellDocument();

    const { uiRefs } = await import("../../src/ui/refs");
    const { loadParamsIntoUI, readUIIntoParams } = await import("../../src/ui/params");
    const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");

    const params = cloneParams(SCENARIO_DEFAULTS);
    params.star.photometry = {
      ...(params.star.photometry ?? {}),
      stellarVariability: {
        enabled: true,
        beamingAmp: 0,
        ellipsoidalAmp: 0,
        constant: 0,
        flare: { enabled: true, tPeakSec: 120, amp: 0.01, riseSec: 10, decaySec: 30 },
        pulsations: {
          enabled: true,
          modes: [
            { amp: 1e-3, periodSec: 100, phaseRad: 0 },
            { amp: 5e-4, periodSec: 250, phaseRad: 1 },
          ],
        },
      },
    };

    loadParamsIntoUI(params, uiRefs);
    const next = readUIIntoParams(params, uiRefs, cloneParams(SCENARIO_DEFAULTS));

    expect(next.star.photometry?.stellarVariability?.flare?.enabled).toBe(true);
    expect(next.star.photometry?.stellarVariability?.flare?.amp).toBe(0.01);
    expect(next.star.photometry?.stellarVariability?.pulsations?.modes).toHaveLength(2);
  });

  it("keeps every accepted grid resolution inside the shared solver range", async () => {
    installAppShellDocument();

    const { uiRefs } = await import("../../src/ui/refs");
    const { readUIIntoParams } = await import("../../src/ui/params");
    const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");
    const { MAX_TRANSIT_GRID_RES, MIN_TRANSIT_GRID_RES } = await import(
      "../../src/core/transitComputeBudget"
    );
    const { clampGridRes } = await import("../../src/photometry/occulterCircle");

    expect(uiRefs.gridRes.min).toBe(String(MIN_TRANSIT_GRID_RES));
    expect(uiRefs.gridRes.max).toBe(String(MAX_TRANSIT_GRID_RES));
    const metadata = scenarioJson.ui.controls.find((param) => param.id === "gridRes");
    expect(metadata?.ui.min).toBe(MIN_TRANSIT_GRID_RES);
    expect(metadata?.ui.max).toBe(MAX_TRANSIT_GRID_RES);
    expect(metadata?.override.min).toBe(MIN_TRANSIT_GRID_RES);
    expect(metadata?.override.max).toBe(MAX_TRANSIT_GRID_RES);

    for (const gridRes of [MIN_TRANSIT_GRID_RES, 220, MAX_TRANSIT_GRID_RES]) {
      uiRefs.gridRes.value = String(gridRes);
      const next = readUIIntoParams(cloneParams(SCENARIO_DEFAULTS), uiRefs, cloneParams(SCENARIO_DEFAULTS));
      expect(next.star.photometry?.gridRes).toBe(gridRes);
      expect(clampGridRes(next.star.photometry?.gridRes, 220)).toBe(gridRes);
    }
  });
});
