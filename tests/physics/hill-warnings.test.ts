import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { validateSystemParamsPhysics } from "../../src/physics/hill";

describe("validateSystemParamsPhysics (Hill apoapsis)", () => {
  it("warns when moon apoapsis exceeds the Hill radius", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    (params.moon!.orbitAroundPlanet as any).a = 1e9;
    (params.moon!.orbitAroundPlanet as any).e = 0;

    const warnings = validateSystemParamsPhysics(params);
    expect(warnings.some((w) => w.code === "MOON_APO_OUTSIDE_HILL")).toBe(true);
  });

  it("does not warn for the default scenario", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    const warnings = validateSystemParamsPhysics(params);
    expect(warnings.some((w) => w.code === "MOON_APO_OUTSIDE_HILL")).toBe(false);
  });
});
