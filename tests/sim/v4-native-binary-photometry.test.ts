import { describe, expect, it } from "vitest";

import type { SimulationConfigV4 } from "../../src/sim/v4/types";
import { createSimulationV4 } from "../../src/sim/v4/runtime";

describe("v4 native binary photometry", () => {
  it("computes mutual stellar eclipses with two luminous stars", async () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime" },
      observer: { dir: { x: 1, y: 0, z: 0 } },
      bodies: {
        stars: [
          { id: "star-a", r: 1, m: 2, luminosityScale: 1 },
          { id: "star-b", r: 1, m: 1, luminosityScale: 0.5 },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1 },
    };

    const sim = createSimulationV4(cfg);
    await sim.prepare();
    const step = sim.step(0);

    // Baseline luminous sum is 1.5, but at t=0 star-b sits in front and eclipses star-a strongly.
    expect(step.flux.total).toBeLessThan(1.5);
    expect(step.flux.transitFactor).toBeLessThan(1);
    expect(step.flux.decomposition?.stellarA).toBeLessThan(1);
    expect(step.flux.decomposition?.stellarB).toBeGreaterThan(0);
  });
});
