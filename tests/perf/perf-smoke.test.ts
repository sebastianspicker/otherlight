import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";

import { buildBinaryLabParams } from "../../src/app/binaryLab";
import { stepSystem } from "../../src/sim/sim";

describe("perf smoke", () => {
  it("steps detached binary scene within budget", () => {
    const system = buildBinaryLabParams();
    const n = 800;
    let t = 0;
    const dt = 5;

    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      t += dt;
      stepSystem(system, t);
    }
    const t1 = performance.now();

    const msPerStep = (t1 - t0) / n;
    expect(Number.isFinite(msPerStep)).toBe(true);
    expect(msPerStep).toBeLessThan(50);
  });
});
