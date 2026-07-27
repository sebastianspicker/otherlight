/** Verifies N-body energy calculations in orbital dynamics and numerical integration. */

import { beforeEach, describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { integrateToTimeWithConfig } from "../../src/sim/nbody/integrator";
import { computePotentialEnergy } from "../../src/sim/nbody/diagnosticsEnergy";
import { G_SI } from "../../src/core/units";
import type { NBodyState, ResolvedNBodyConfig } from "../../src/sim/nbody/types";
import { getNBodyStateAt, resetNBodyCache } from "../../src/sim/dynamics";

beforeEach(() => {
  resetNBodyCache();
});
import { vLenSq, vSub } from "../../src/physics/vec3";

function circularPeriod(a: number, muCentral: number): number {
  return 2 * Math.PI * Math.sqrt((a * a * a) / muCentral);
}

function assertEnergyBodyCount(positions: unknown[], velocities: unknown[], mus: number[]): void {
  if (positions.length !== mus.length || velocities.length !== mus.length) {
    throw new Error("energy test helper: body count mismatch");
  }
}

function stateVectors(state: NBodyState): {
  positions: Array<{ x: number; y: number; z: number }>;
  velocities: Array<{ x: number; y: number; z: number }>;
} {
  return {
    positions: [state.rS, state.rP, state.rM, ...(state.perturbers ?? []).map((p) => p.r)],
    velocities: [state.vS, state.vP, state.vM, ...(state.perturbers ?? []).map((p) => p.v)],
  };
}

function kineticEnergyAssumingG1(
  velocities: Array<{ x: number; y: number; z: number }>,
  mus: number[],
): number {
  let T = 0;
  for (let i = 0; i < mus.length; i++) {
    T += 0.5 * mus[i] * vLenSq(velocities[i]);
  }
  return T;
}

function potentialEnergyAssumingG1(
  positions: Array<{ x: number; y: number; z: number }>,
  mus: number[],
): number {
  let U = 0;
  for (let i = 0; i < mus.length; i++) {
    for (let j = i + 1; j < mus.length; j++) {
      const dr = vSub(positions[j], positions[i]);
      const r2 = vLenSq(dr);
      const r = Math.sqrt(r2);
      U += -(mus[i] * mus[j]) / r;
    }
  }
  return U;
}

function totalEnergyAssumingG1(params: { state: NBodyState; mus: number[] }): number {
  const { mus } = params;
  const { positions, velocities } = stateVectors(params.state);
  assertEnergyBodyCount(positions, velocities, mus);

  // Assumption (documented in the test): choose units with G=1, m_i := mu_i.
  return kineticEnergyAssumingG1(velocities, mus) + potentialEnergyAssumingG1(positions, mus);
}

describe("N-body (energy drift sanity)", () => {
  it("uses the same Plummer-softened potential as the integrated force law", () => {
    const arrays = {
      positions: [
        { x: 0, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
      ],
      velocities: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
      ],
      mus: [2, 5],
    } as any;

    expect(computePotentialEnergy(arrays, 4)).toBeCloseTo(-(2 * 5) / (G_SI * 5), 12);
  });

  it("keeps total mechanical energy approximately conserved for a stable 3-body configuration", () => {
    const muStar = 1;
    const muPlanet = 1e-3;
    const muMoon = 1e-6;

    const aP = 1;
    const aM = 0.02;

    const periodP = circularPeriod(aP, muStar + muPlanet + muMoon);
    const periodM = circularPeriod(aM, muPlanet + muMoon);

    const params: SystemParams = {
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
          dtMax: periodP / 2000,
          softening: 0,
          perturbers: [],
        },
      },
    };

    const init = getNBodyStateAt(params, 0);
    if (!init) throw new Error("expected nbody to be enabled");

    const mus = [muStar, muPlanet, muMoon];
    let state = init.state;

    const dt = periodP / 2000;
    const e0 = totalEnergyAssumingG1({ state, mus });
    const cfg: ResolvedNBodyConfig = {
      muStar,
      muPlanet,
      muMoon,
      dtMaxAbs: dt,
      softening: 0,
      throwOnOverlap: false,
      perturbers: [],
      relativity: { grOn: false, c: 299792458 },
      integrator: {
        mode: "fixed-verlet",
        errorTolAbs: 1e-3,
        dtMin: 1e-6,
        growthFactor: 1.5,
        shrinkFactor: 0.5,
        maxSubsteps: 1_000_000,
      },
      collision: {
        enabled: false,
        minSeparation: 0,
        onCloseEncounter: "warn",
      },
    };

    const steps = 5000;
    for (let i = 0; i < steps; i++) {
      state = integrateToTimeWithConfig({ state, tTarget: state.t + dt, cfg, maxSteps: 2 });
    }

    const e1 = totalEnergyAssumingG1({ state, mus });

    // Velocity-Verlet is symplectic: energy oscillates with small bounded error.
    // Tolerance chosen conservatively to avoid flakiness across JS engines.
    const relDrift = Math.abs((e1 - e0) / e0);
    expect(relDrift).toBeLessThan(5e-3);
  });
});
