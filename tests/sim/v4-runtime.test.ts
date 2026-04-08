import { describe, expect, it } from "vitest";

import type { SimulationConfigV4 } from "../../src/sim/v4/types";
import { createSimulationV4 } from "../../src/sim/v4/runtime";

describe("sim v4 runtime", () => {
  it("steps in realtime and reference modes with finite flux", async () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, luminosityScale: 1 },
          { id: "star-b", r: 5.0e8, m: 1.2e30, luminosityScale: 0.35 },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1 },
    };

    const sim = createSimulationV4(cfg);
    await sim.prepare();

    const realtime = sim.step(0);
    expect(Number.isFinite(realtime.flux.total)).toBe(true);

    sim.setMode("reference");
    const reference = sim.step(1000);
    expect(Number.isFinite(reference.flux.total)).toBe(true);
  });

  it("reports N-body enablement from the V4 config", async () => {
    const baseCfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, luminosityScale: 1 },
          { id: "star-b", r: 5.0e8, m: 1.2e30, luminosityScale: 0.35 },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1 },
    };

    const simDisabled = createSimulationV4(baseCfg);
    await simDisabled.prepare();
    expect(simDisabled.step(0).physicsDiagnostics?.integratorStats?.nbodyEnabled).toBe(false);

    const simEnabled = createSimulationV4({
      ...baseCfg,
      dynamics: {
        nbodyPlanetMoon: { enabled: true },
      },
    });
    await simEnabled.prepare();
    expect(simEnabled.step(0).physicsDiagnostics?.integratorStats?.nbodyEnabled).toBe(true);
  });
});
