/** Verifies dynamics adaptive calculations in orbital dynamics and numerical integration. */

import { beforeEach, describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { getNBodyConservationAt, getNBodyStateAt, resetNBodyCache } from "../../src/sim/dynamics";
import { integrateToTimeWithConfig } from "../../src/sim/nbody/integrator";
import type { NBodyState, ResolvedNBodyConfig } from "../../src/sim/nbody/types";

beforeEach(() => {
  resetNBodyCache();
});

function circularPeriod(a: number, muCentral: number): number {
  return 2 * Math.PI * Math.sqrt((a * a * a) / muCentral);
}

function makeParams(mode: "fixed-verlet" | "adaptive-verlet"): SystemParams {
  const muStar = 1;
  const muPlanet = 1e-3;
  const muMoon = 1e-6;

  const aP = 1;
  const aM = 0.02;

  const periodP = circularPeriod(aP, muStar + muPlanet + muMoon);
  const periodM = circularPeriod(aM, muPlanet + muMoon);

  return {
    star: { r: 1 },
    planet: {
      r: 0.05,
      orbit: { a: aP, e: 0, inc: 0.2, Omega: 0, omega: 0, period: periodP, t0: 0 },
    },
    moon: {
      r: 0.01,
      orbitAroundPlanet: { a: aM, e: 0, inc: 0.1, Omega: 0, omega: 0, period: periodM, t0: 0 },
    },
    dynamics: {
      nbodyPlanetMoon: {
        enabled: true,
        muStar,
        muPlanet,
        muMoon,
        dtMax: periodP / 100,
        softening: 0,
        integrator: {
          mode,
          errorTolAbs: 1e-4,
          dtMin: 1e-5,
          maxSubsteps: 200_000,
        },
      },
      integrator: {
        mode,
      },
      collisionPolicy: {
        enabled: false,
      },
    },
  };
}

describe("adaptive n-body integrator", () => {
  it("produces finite states and remains close to fixed-step for benign orbits", () => {
    const fixed = makeParams("fixed-verlet");
    const adaptive = makeParams("adaptive-verlet");

    const t = 0.5;
    const sf = getNBodyStateAt(fixed, t);
    const sa = getNBodyStateAt(adaptive, t);

    expect(sf).not.toBeNull();
    expect(sa).not.toBeNull();

    const dx = Math.hypot(
      (sf!.state.rP.x - sa!.state.rP.x) as number,
      (sf!.state.rP.y - sa!.state.rP.y) as number,
      (sf!.state.rP.z - sa!.state.rP.z) as number,
    );
    expect(Number.isFinite(dx)).toBe(true);
    expect(dx).toBeLessThan(5e-2);

    const cons = getNBodyConservationAt(adaptive, t);
    expect(cons).not.toBeNull();
    expect(Number.isFinite(cons!.energy)).toBe(true);
    expect(Number.isFinite(cons!.angularMomentum)).toBe(true);
  });

  it("fails closed when dtMin cannot satisfy the adaptive error tolerance", () => {
    const state: NBodyState = {
      t: 0,
      rS: { x: 0, y: 0, z: 0 },
      vS: { x: 0, y: 0, z: 0 },
      rP: { x: 1, y: 0, z: 0 },
      vP: { x: 0, y: 0, z: 0 },
      rM: { x: 0.5, y: 0, z: 0 },
      vM: { x: 0, y: 0, z: 0 },
      perturbers: [],
    };
    const cfg: ResolvedNBodyConfig = {
      muStar: 1,
      muPlanet: 1e-3,
      muMoon: 1e-6,
      dtMaxAbs: 1,
      softening: 0,
      throwOnOverlap: false,
      perturbers: [],
      relativity: { grOn: false, c: 299792458 },
      integrator: {
        mode: "adaptive-verlet",
        errorTolAbs: 1e-30,
        dtMin: 1,
        growthFactor: 1.5,
        shrinkFactor: 0.5,
        maxSubsteps: 10,
      },
      collision: { enabled: false, minSeparation: 0, onCloseEncounter: "warn" },
    };

    expect(() => integrateToTimeWithConfig({ state, tTarget: 1, cfg })).toThrow(
      "cannot meet error tolerance at dtMin",
    );
  });
});
