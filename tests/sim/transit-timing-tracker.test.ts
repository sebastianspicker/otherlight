import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { stepSystem } from "../../src/sim/sim";

describe("transit timing tracker", () => {
  it("estimates planet transit center and duration from dynamic state", () => {
    const period = 1000;
    const params: SystemParams = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 1, photometry: { baselineFlux: 1, gridRes: 300 } },
      planet: {
        r: 0.1,
        orbit: {
          a: 5,
          e: 0,
          inc: Math.PI / 2,
          Omega: 0,
          omega: 0,
          period,
          t0: 0,
        },
      },
    };

    const tNearCenter = period / 4;
    const step = stepSystem(params, tNearCenter);
    const timing = step.meta?.timing;

    expect(Number.isFinite(timing?.planetTransitCenterSec)).toBe(true);
    expect(Number.isFinite(timing?.planetTransitDurationSec)).toBe(true);
    expect(Number.isFinite(timing?.planetIngressSec)).toBe(true);
    expect(Number.isFinite(timing?.planetEgressSec)).toBe(true);
    expect((timing?.planetTransitDurationSec ?? 0) > 0).toBe(true);
    expect(Math.abs((timing?.planetTransitCenterSec ?? 0) - tNearCenter)).toBeLessThan(5);
  });

  it("does not report a transit event when the trajectory is not in front of the star", () => {
    const period = 1000;
    const params: SystemParams = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 1, photometry: { baselineFlux: 1, gridRes: 300 } },
      planet: {
        r: 0.1,
        orbit: {
          a: 5,
          e: 0,
          inc: 0,
          Omega: 0,
          omega: 0,
          period,
          t0: 0,
        },
      },
    };

    const step = stepSystem(params, 0);
    const timing = step.meta?.timing;

    expect(timing?.planetTransitCenterSec).toBeUndefined();
    expect(timing?.planetTransitDurationSec).toBeUndefined();
    expect(timing?.planetIngressSec).toBeUndefined();
    expect(timing?.planetEgressSec).toBeUndefined();
  });
});
