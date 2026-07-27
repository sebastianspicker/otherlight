/** Verifies observables contracts across system state, transit observables, and V4 integration. */

import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { stepSystem } from "../../src/sim/sim";

describe("step observables", () => {
  it("provides RV/astrometry observables when enabled", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.star.m = params.star.m ?? 1.0e30;
    params.planet.m = params.planet.m ?? 1.0e27;
    params.dynamics = params.dynamics ?? {};
    params.dynamics.physicsFeatures = {
      ...(params.dynamics.physicsFeatures ?? {}),
      observables: true,
    };
    params.dynamics.relativity = {
      enabled: true,
      ltte: true,
      shapiro: true,
      grPrecession: false,
      c: 299_792_458,
    };

    const step = stepSystem(params, 1234);
    const obs = step.meta?.observables;

    expect(obs).toBeDefined();
    expect(Number.isFinite(obs?.rvPlanet)).toBe(true);
    expect(Number.isFinite(obs?.rvStar)).toBe(true);
    expect(Number.isFinite(obs?.astrometricOffsetStar?.x)).toBe(true);
    expect(Number.isFinite(obs?.astrometricOffsetStar?.y)).toBe(true);
    expect(obs?.timing?.lttePlanetSec).toBeDefined();
  });

  it("suppresses observables when feature flag is disabled", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.dynamics = params.dynamics ?? {};
    params.dynamics.physicsFeatures = {
      ...(params.dynamics.physicsFeatures ?? {}),
      observables: false,
    };

    const step = stepSystem(params, 10);
    expect(step.meta?.observables).toBeUndefined();
  });
});
