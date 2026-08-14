/** Verifies N-body config calculations in orbital dynamics and numerical integration. */

import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import type { SystemParams } from "../../src/core/types";
import { G_SI } from "../../src/core/units";
import {
  collectNBodyKeplerPeriodMismatches,
  resolveEnabledNBodyPlanetMoonConfig,
  resolveNBodyConfig,
} from "../../src/sim/nbody/config";

function circularPeriod(a: number, mu: number): number {
  return 2 * Math.PI * Math.sqrt(a ** 3 / mu);
}

function staticPlanetOrbit(params: SystemParams) {
  if (typeof params.planet.orbit === "function") throw new Error("missing planet orbit");
  return params.planet.orbit;
}

function referenceNBodyParams(): SystemParams {
  const muStar = 1;
  const muPlanet = 1e-3;
  const muMoon = 1e-6;
  const muPerturber = 1e-4;
  const outerA = 1;
  const lunarA = 0.02;
  const perturberA = 2;

  return {
    star: { r: 1 },
    planet: {
      r: 0.05,
      orbit: {
        a: outerA,
        e: 0,
        inc: 0,
        Omega: 0,
        omega: 0,
        period: circularPeriod(outerA, muStar + muPlanet + muMoon),
        t0: 0,
      },
    },
    moon: {
      r: 0.01,
      orbitAroundPlanet: {
        a: lunarA,
        e: 0,
        inc: 0,
        Omega: 0,
        omega: 0,
        period: circularPeriod(lunarA, muPlanet + muMoon),
        t0: 0,
      },
    },
    dynamics: {
      fidelityProfile: "reference",
      nbodyPlanetMoon: {
        enabled: true,
        muStar,
        muPlanet,
        muMoon,
        dtMax: 0.01,
        perturbers: [
          {
            mu: muPerturber,
            orbit: {
              a: perturberA,
              e: 0,
              inc: 0,
              Omega: 0,
              omega: 0,
              period: circularPeriod(perturberA, muStar + muPerturber),
              t0: 0,
            },
          },
        ],
      },
    },
  };
}

describe("resolveEnabledNBodyPlanetMoonConfig", () => {
  it("computes mu from masses when mu is missing", () => {
    const cfg = {
      enabled: true,
      mStar: 2,
      mPlanet: 3,
      mMoon: 4,
      dtMax: 1,
    };

    const resolved = resolveEnabledNBodyPlanetMoonConfig(cfg, { onInvalid: "throw", G: G_SI });
    expect(resolved).not.toBeNull();
    expect(resolved!.muStar).toBeCloseTo(G_SI * 2, 12);
    expect(resolved!.muPlanet).toBeCloseTo(G_SI * 3, 12);
    expect(resolved!.muMoon).toBeCloseTo(G_SI * 4, 12);
  });

  it("uses mu when provided, even if masses are present", () => {
    const cfg = {
      enabled: true,
      muStar: 10,
      muPlanet: 20,
      muMoon: 30,
      mStar: 2,
      mPlanet: 3,
      mMoon: 4,
      dtMax: 1,
    };

    const resolved = resolveEnabledNBodyPlanetMoonConfig(cfg, { onInvalid: "throw", G: G_SI });
    expect(resolved).not.toBeNull();
    expect(resolved!.muStar).toBe(10);
    expect(resolved!.muPlanet).toBe(20);
    expect(resolved!.muMoon).toBe(30);
  });

  it("accepts masses from opts when cfg omits them", () => {
    const cfg = {
      enabled: true,
      dtMax: 1,
    };

    const resolved = resolveEnabledNBodyPlanetMoonConfig(cfg, {
      onInvalid: "throw",
      masses: { star: 2, planet: 3, moon: 4 },
      G: G_SI,
    });
    expect(resolved).not.toBeNull();
    expect(resolved!.muStar).toBeCloseTo(G_SI * 2, 12);
    expect(resolved!.muPlanet).toBeCloseTo(G_SI * 3, 12);
    expect(resolved!.muMoon).toBeCloseTo(G_SI * 4, 12);
  });

  it("preserves an explicit small maxSubsteps cap", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.dynamics = {
      nbodyPlanetMoon: {
        enabled: true,
        dtMax: 1,
        muStar: 10,
        muPlanet: 20,
        muMoon: 30,
        integrator: { maxSubsteps: 1 },
      },
    };

    expect(resolveNBodyConfig(params)?.cfg.integrator.maxSubsteps).toBe(1);
  });

  it("accepts rounded reference periods without rewriting their declared values", () => {
    const params = referenceNBodyParams();
    const orbit = staticPlanetOrbit(params);
    const declaredPeriod = orbit.period * (1 + 9e-5);
    orbit.period = declaredPeriod;

    const resolved = resolveNBodyConfig(params);

    expect(resolved?.keyInputs.planetEl.period).toBe(declaredPeriod);
    expect(collectNBodyKeplerPeriodMismatches(params)).toEqual([]);
  });

  it.each([
    ["planet.orbit", (params: SystemParams) => (staticPlanetOrbit(params).period *= 1.01)],
    [
      "moon.orbitAroundPlanet",
      (params: SystemParams) => {
        if (!params.moon || typeof params.moon.orbitAroundPlanet === "function")
          throw new Error("missing moon");
        params.moon.orbitAroundPlanet.period *= 1.01;
      },
    ],
    [
      "dynamics.nbodyPlanetMoon.perturbers[0].orbit",
      (params: SystemParams) => {
        const orbit = params.dynamics?.nbodyPlanetMoon?.perturbers?.[0]?.orbit;
        if (!orbit || typeof orbit === "function") throw new Error("missing perturber");
        orbit.period *= 1.01;
      },
    ],
  ])("rejects reference-mode %s period contradictions", (path, contradict) => {
    const params = referenceNBodyParams();
    contradict(params);

    expect(() => resolveNBodyConfig(params)).toThrow(path);
  });

  it("reports non-reference period contradictions without changing initial-condition inputs", () => {
    const params = referenceNBodyParams();
    params.dynamics!.fidelityProfile = "interactive";
    const orbit = staticPlanetOrbit(params);
    const declaredPeriod = orbit.period * 1.01;
    orbit.period = declaredPeriod;

    const resolved = resolveNBodyConfig(params);
    const mismatches = collectNBodyKeplerPeriodMismatches(params);

    expect(resolved?.keyInputs.planetEl.period).toBe(declaredPeriod);
    expect(mismatches).toEqual([
      expect.objectContaining({ path: "planet.orbit", suppliedPeriod: declaredPeriod }),
    ]);
  });
});
