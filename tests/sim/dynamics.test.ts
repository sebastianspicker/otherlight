import { beforeEach, describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { isNBodyEnabled, getNBodyStateAt, getNBodyConservationAt, resetNBodyCache } from "../../src/sim/dynamics";
import type { SystemParams } from "../../src/core/types";

beforeEach(() => {
  resetNBodyCache();
});

function defaults(): SystemParams {
  return cloneParams(SCENARIO_DEFAULTS);
}

function withNBody(params: SystemParams): SystemParams {
  params.star.m = 1.989e30;
  params.planet.m = 1.898e27;
  if (params.moon) params.moon.m = 7.342e22;
  params.dynamics = {
    ...params.dynamics,
    nbodyPlanetMoon: {
      enabled: true,
      muStar: 1.327e20,
      muPlanet: 1.266e17,
      muMoon: 4.9e12,
      dtMax: 60,
      softening: 0,
    },
  };
  return params;
}

describe("isNBodyEnabled", () => {
  it("returns false for default params", () => {
    expect(isNBodyEnabled(defaults())).toBe(false);
  });

  it("returns true when nbodyPlanetMoon is enabled", () => {
    const params = withNBody(defaults());
    expect(isNBodyEnabled(params)).toBe(true);
  });

  it("returns false when nbodyPlanetMoon is explicitly disabled", () => {
    const params = defaults();
    params.dynamics = { nbodyPlanetMoon: { enabled: false } };
    expect(isNBodyEnabled(params)).toBe(false);
  });
});

describe("getNBodyStateAt", () => {
  it("returns null when nbody is not enabled", () => {
    const params = defaults();
    const result = getNBodyStateAt(params, 0);
    expect(result).toBeNull();
  });

  it("throws on NaN time", () => {
    const params = withNBody(defaults());
    expect(() => getNBodyStateAt(params, NaN)).toThrow("t must be finite");
  });

  it("returns state with rBary when nbody is enabled", () => {
    const params = withNBody(defaults());
    const result = getNBodyStateAt(params, 0);
    expect(result).not.toBeNull();
    expect(result!.rBary).toBeDefined();
    expect(Number.isFinite(result!.rBary.x)).toBe(true);
    expect(Number.isFinite(result!.rBary.y)).toBe(true);
    expect(Number.isFinite(result!.rBary.z)).toBe(true);
  });

  it("returns evolving state at different times", () => {
    const params = withNBody(defaults());
    const s0 = getNBodyStateAt(params, 0);
    const s1 = getNBodyStateAt(params, 1000);
    expect(s0).not.toBeNull();
    expect(s1).not.toBeNull();
    // State should have evolved
    const posChanged =
      s0!.state.rP.x !== s1!.state.rP.x ||
      s0!.state.rP.y !== s1!.state.rP.y ||
      s0!.state.rP.z !== s1!.state.rP.z;
    expect(posChanged).toBe(true);
  });
});

describe("getNBodyConservationAt", () => {
  it("returns null when nbody is not enabled", () => {
    const params = defaults();
    expect(getNBodyConservationAt(params, 0)).toBeNull();
  });

  it("returns conservation diagnostics when nbody is enabled", () => {
    const params = withNBody(defaults());
    const diag = getNBodyConservationAt(params, 100);
    expect(diag).not.toBeNull();
    expect(typeof diag!.energy).toBe("number");
    expect(typeof diag!.angularMomentum).toBe("number");
    expect(Number.isFinite(diag!.energy)).toBe(true);
    expect(Number.isFinite(diag!.angularMomentum)).toBe(true);
  });
});
