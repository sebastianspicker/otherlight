import { describe, expect, it } from "vitest";

import type { SimulationConfigV4 } from "../../src/sim/v4/types";
import { createSimulationV4 } from "../../src/sim/v4/runtime";

describe("v4 native hierarchy runtime", () => {
  it("supports arrays + hierarchy parents without legacy bridge assumptions", async () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "general-lab",
      runtime: { mode: "realtime" },
      observer: { dir: { x: 1, y: 0, z: 0 } },
      bodies: {
        stars: [
          { id: "star-a", r: 1, m: 2, luminosityScale: 1 },
          { id: "star-b", r: 0.8, m: 1, luminosityScale: 0 },
        ],
        planets: [
          {
            id: "planet-a",
            r: 0.25,
            m: 0.01,
            orbit: { a: 0.05, e: 0, inc: 0, Omega: 0, omega: 0, period: 8, t0: 0 },
            parentStarId: "star-a",
            parentSystem: "star",
          },
          {
            id: "planet-b",
            r: 0.12,
            m: 0.005,
            orbit: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 6, t0: 0 },
            parentStarId: "star-b",
            parentSystem: "star",
          },
        ],
        moons: [
          {
            id: "moon-a",
            r: 0.08,
            m: 0.001,
            orbit: { a: 0.02, e: 0, inc: 0, Omega: 0, omega: 0, period: 2, t0: 0 },
            parentPlanetId: "planet-a",
          },
        ],
      },
      orbits: {
        binary: { a: 3, e: 0, inc: 0, Omega: 0, omega: 0, period: 20, t0: 0 },
        hierarchy: [
          { childId: "planet-a", parentId: "star-a", relation: "orbits" },
          { childId: "planet-b", parentId: "star-b", relation: "orbits" },
          { childId: "moon-a", parentId: "planet-a", relation: "orbits" },
        ],
      },
      photometry: { baselineFlux: 1 },
    };

    const sim = createSimulationV4(cfg);
    await sim.prepare();
    const step = sim.step(0);

    expect(Number.isFinite(step.flux.total)).toBe(true);
    expect(step.flux.transitFactor).toBeLessThan(1);
    expect(step.kinematics.moonSky).toBeDefined();
    expect((step.debug?.nOcculters ?? 0) >= 1).toBe(true);
  });

  it("rejects broken hierarchy references instead of falling back to the origin", async () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "general-lab",
      runtime: { mode: "realtime" },
      observer: { dir: { x: 1, y: 0, z: 0 } },
      bodies: {
        stars: [
          { id: "star-a", r: 1, m: 2, luminosityScale: 1 },
          { id: "star-b", r: 0.8, m: 1, luminosityScale: 0 },
        ],
        planets: [
          {
            id: "planet-a",
            r: 0.25,
            m: 0.01,
            orbit: { a: 0.05, e: 0, inc: 0, Omega: 0, omega: 0, period: 8, t0: 0 },
            parentStarId: "missing-star",
            parentSystem: "star",
          },
        ],
        moons: [],
      },
      orbits: {
        binary: { a: 3, e: 0, inc: 0, Omega: 0, omega: 0, period: 20, t0: 0 },
        hierarchy: [{ childId: "planet-a", parentId: "missing-star", relation: "orbits" }],
      },
      photometry: { baselineFlux: 1 },
    };

    expect(() => createSimulationV4(cfg)).toThrow("invalid V4 config");
  });
});
