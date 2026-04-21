import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { stepSystem } from "../../src/sim/sim";

describe("dynamics-driven diagnostics", () => {
  it("keeps TDV diagnostics available even when exomoon timing toggles are disabled", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.dynamics = params.dynamics ?? {};
    params.dynamics.exomoonTimingShape = {
      ...(params.dynamics.exomoonTimingShape ?? {}),
      enabled: false,
    };

    const step = stepSystem(params, 12345);

    expect(Number.isFinite(step.meta?.vPlanetSky)).toBe(true);
    expect(Number.isFinite(step.meta?.vPlanetSkyRef)).toBe(true);
    expect(Number.isFinite(step.meta?.tdvRatio)).toBe(true);
  });

  it("derives star RV from integrated n-body state even without explicit mass closure inputs", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.dynamics = params.dynamics ?? {};
    params.dynamics.physicsFeatures = {
      ...(params.dynamics.physicsFeatures ?? {}),
      observables: true,
    };
    params.dynamics.nbodyPlanetMoon = {
      ...(params.dynamics.nbodyPlanetMoon ?? {}),
      enabled: true,
      dtMax: 30,
      perturbers: [
        {
          enabled: true,
          mu: 2.0e16,
          orbit: {
            a: 1.8e10,
            e: 0.05,
            inc: 0.1,
            Omega: 0.2,
            omega: 0.1,
            period: 2.3e6,
            t0: 0,
          },
        },
      ],
    };

    // Keep N-body mu values, but remove explicit masses to ensure the code path
    // does not fall back to mass-closure reflex reconstruction.
    delete params.star.m;
    delete params.planet.m;
    if (params.moon) delete params.moon.m;

    const step = stepSystem(params, 54321);
    const rvStar = step.meta?.observables?.rvStar;

    expect(Number.isFinite(rvStar)).toBe(true);
    expect(Math.abs(rvStar ?? 0)).toBeGreaterThan(1e-12);
  });
});
