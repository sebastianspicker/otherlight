/** Verifies validation warnings contracts across system state, transit observables, and V4 integration. */

import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { collectParamWarnings } from "../../src/sim/validation";

function enableNbody(params: SystemParams): void {
  params.dynamics = params.dynamics ?? ({} as any);
  (params.dynamics as any).nbodyPlanetMoon = {
    ...(params.dynamics as any).nbodyPlanetMoon,
    enabled: true,
  };
}

describe("collectParamWarnings (n-body dtMax)", () => {
  it("warns when dtMax is coarse relative to the shortest orbit period", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    enableNbody(params);

    const moonPeriod = (params.moon!.orbitAroundPlanet as any).period as number;
    (params.dynamics as any).nbodyPlanetMoon.dtMax = moonPeriod / 20;

    const warnings = collectParamWarnings(params);
    expect(warnings.some((w) => w.code === "NBODY_DT_COARSE")).toBe(true);
  });

  it("does not warn when dtMax is sufficiently small", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    enableNbody(params);

    const moonPeriod = (params.moon!.orbitAroundPlanet as any).period as number;
    (params.dynamics as any).nbodyPlanetMoon.dtMax = moonPeriod / 200;

    const warnings = collectParamWarnings(params);
    expect(warnings.some((w) => w.code === "NBODY_DT_COARSE")).toBe(false);
  });
});

describe("collectParamWarnings (Roche limit)", () => {
  it("warns when moon pericenter is inside the fluid Roche limit", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    const planetR = params.planet.r;

    (params.moon!.orbitAroundPlanet as any).a = planetR * 1.1;
    (params.moon!.orbitAroundPlanet as any).e = 0;

    const warnings = collectParamWarnings(params);
    expect(warnings.some((w) => w.code === "MOON_ROCHE_LIMIT")).toBe(true);
  });

  it("does not warn when moon mass is missing", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    (params.moon as any).m = undefined;

    const warnings = collectParamWarnings(params);
    expect(warnings.some((w) => w.code === "MOON_ROCHE_LIMIT")).toBe(false);
  });
});
