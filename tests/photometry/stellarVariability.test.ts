import { describe, expect, it } from "vitest";

import { stellarVariabilityFlux } from "../../src/photometry/stellarVariability";

const orbit = {
  a: 1,
  e: 0,
  inc: 0,
  Omega: 0,
  omega: 0,
  period: 100,
  t0: 0,
} as const;

describe("stellarVariabilityFlux", () => {
  it("adds a bounded flare with a peak near the configured flare time", () => {
    const model = {
      enabled: true,
      flare: {
        enabled: true,
        tPeakSec: 50,
        amp: 0.02,
        riseSec: 8,
        decaySec: 20,
      },
    };

    const before = stellarVariabilityFlux({ t: 42, orbit, model });
    const peak = stellarVariabilityFlux({ t: 50, orbit, model });
    const after = stellarVariabilityFlux({ t: 80, orbit, model });

    expect(before).toBeGreaterThan(0);
    expect(peak).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(peak);
  });

  it("adds deterministic multi-sine pulsation modes", () => {
    const model = {
      enabled: true,
      pulsations: {
        enabled: true,
        modes: [
          { amp: 1e-3, periodSec: 10, phaseRad: 0 },
          { amp: 5e-4, periodSec: 20, phaseRad: Math.PI / 2 },
        ],
      },
    };

    const out = stellarVariabilityFlux({ t: 2.5, orbit, model });

    expect(out).toBeCloseTo(1e-3 + 5e-4 * Math.SQRT1_2, 12);
  });
});
