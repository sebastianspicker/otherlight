import { describe, expect, it } from "vitest";

import type { SimulationConfigV4 } from "../../src/sim/v4/types";
import { createSimulationV4 } from "../../src/sim/v4/runtime";

function baseCfg(): SimulationConfigV4 {
  return {
    version: "4",
    mode: "general-lab",
    runtime: { mode: "realtime" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        { id: "star-a", r: 1, m: 2, luminosityScale: 1 },
        { id: "star-b", r: 1, m: 1, luminosityScale: 0 },
      ],
      planets: [
        {
          id: "planet-1",
          r: 0.3,
          m: 0.01,
          orbit: { a: 0.05, e: 0, inc: 0, Omega: 0, omega: 0, period: 8, t0: 0 },
          parentStarId: "star-a",
          parentSystem: "star",
        },
      ],
      moons: [],
    },
    orbits: {
      binary: { a: 3, e: 0, inc: 0, Omega: 0, omega: 0, period: 20, t0: 0 },
      hierarchy: [{ childId: "planet-1", parentId: "star-a", relation: "orbits" }],
    },
    photometry: { baselineFlux: 1 },
  };
}

describe("v4 native atmosphere transmission", () => {
  it("reduces effective blocking for low-opacity RT layers", async () => {
    const opaque = baseCfg();
    const rt = baseCfg();
    rt.photometry = {
      ...rt.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-4 }],
      },
    };

    const simOpaque = createSimulationV4(opaque);
    const simRt = createSimulationV4(rt);
    await simOpaque.prepare();
    await simRt.prepare();

    const fOpaque = simOpaque.step(0).flux.total;
    const fRt = simRt.step(0).flux.total;

    expect(fRt).toBeGreaterThanOrEqual(fOpaque);
  });
});
