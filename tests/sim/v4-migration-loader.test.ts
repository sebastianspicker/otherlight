import { describe, expect, it } from "vitest";

import { normalizeScenarioInputToV4 } from "../../src/sim/v4/migrate";

describe("v4 runtime migration loader", () => {
  it("auto-migrates legacy v2-like payload to v4", () => {
    const legacy = {
      star: { r: 6.957e8, m: 1.98847e30 },
      planet: {
        r: 6.5e8,
        m: 1.2e30,
        orbit: { a: 1.4e10, e: 0.05, inc: 1.55, Omega: 0, omega: 0, period: 8.0e5, t0: 0 },
      },
      observer: { dir: { x: 1, y: 0, z: 1 } },
    };

    const out = normalizeScenarioInputToV4(legacy);
    expect(out.version).toBe("4");
    expect(out.mode).toBe("general-lab");
    expect(out.bodies.stars).toHaveLength(2);
    expect(out.bodies.planets).toHaveLength(1);
    expect(out.orbits.binary.period).toBe(8.0e5);
  });

  it("rejects malformed V4 payloads instead of treating them as legacy configs", () => {
    expect(() =>
      normalizeScenarioInputToV4({
        version: "4",
        mode: "general-lab",
        bodies: {},
      }),
    ).toThrow("invalid V4 config");
  });
});
