import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { integrateNBodyStep } from "../../src/sim/nbody/integrator";
import type { NBodyState } from "../../src/sim/nbody/types";
import { getNBodyStateAt } from "../../src/sim/dynamics";
import { vLenSq, vSub } from "../../src/physics/vec3";

function circularPeriod(a: number, muCentral: number): number {
  return 2 * Math.PI * Math.sqrt((a * a * a) / muCentral);
}

function totalEnergyAssumingG1(params: { state: NBodyState; mus: number[] }): number {
  const { state, mus } = params;
  const positions = [state.rS, state.rP, state.rM, ...(state.perturbers ?? []).map((p) => p.r)];
  const velocities = [state.vS, state.vP, state.vM, ...(state.perturbers ?? []).map((p) => p.v)];

  if (positions.length !== mus.length || velocities.length !== mus.length) {
    throw new Error("energy test helper: body count mismatch");
  }

  // Assumption (documented in the test): choose units with G=1, m_i := mu_i.
  // Then:
  //  - T = Σ 1/2 m_i |v_i|^2
  //  - U = - Σ_{i<j} m_i m_j / r_ij
  let T = 0;
  for (let i = 0; i < mus.length; i++) {
    T += 0.5 * mus[i] * vLenSq(velocities[i]);
  }

  let U = 0;
  for (let i = 0; i < mus.length; i++) {
    for (let j = i + 1; j < mus.length; j++) {
      const dr = vSub(positions[j], positions[i]);
      const r2 = vLenSq(dr);
      const r = Math.sqrt(r2);
      U += -(mus[i] * mus[j]) / r;
    }
  }

  return T + U;
}

describe("N-body (energy drift sanity)", () => {
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

    const steps = 5000;
    for (let i = 0; i < steps; i++) {
      state = integrateNBodyStep({
        state,
        dt,
        muStar,
        muPlanet,
        muMoon,
        muPerturbers: [],
        softening: 0,
      });
    }

    const e1 = totalEnergyAssumingG1({ state, mus });

    // Velocity-Verlet is symplectic: energy oscillates with small bounded error.
    // Tolerance chosen conservatively to avoid flakiness across JS engines.
    const relDrift = Math.abs((e1 - e0) / e0);
    expect(relDrift).toBeLessThan(5e-3);
  });
});
