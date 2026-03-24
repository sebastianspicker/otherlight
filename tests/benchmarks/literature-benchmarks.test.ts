import { describe, expect, it } from "vitest";

import { buildBinaryLabParams } from "../../src/app/binaryLab";
import { stepSystem } from "../../src/sim/sim";

function depthAt(system: ReturnType<typeof buildBinaryLabParams>, tSec: number): number {
  const step = stepSystem(system, tSec);
  return 1 - (step.fluxTransitFactor ?? 1);
}

describe("literature benchmark smoke", () => {
  it("keeps detached binary eclipse depth finite and periodic", () => {
    const system = buildBinaryLabParams();
    const period = typeof system.planet.orbit === "function" ? 1 : system.planet.orbit.period;

    const d0 = depthAt(system, 0);
    const d1 = depthAt(system, period);
    const dHalf = depthAt(system, period / 2);

    expect(Number.isFinite(d0)).toBe(true);
    expect(Number.isFinite(d1)).toBe(true);
    expect(Number.isFinite(dHalf)).toBe(true);
    expect(Math.abs(d0 - d1)).toBeLessThan(0.05);
  });
});
