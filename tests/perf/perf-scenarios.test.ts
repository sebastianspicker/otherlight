import { beforeAll, describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";

import { getPresetById } from "../../src/app/presets";
import { stepSystem } from "../../src/sim/sim";
import { setDidacticsHook } from "../../src/sim/didacticsHook";
import { computeDidacticSignals } from "../../src/didactics/engine";

beforeAll(() => {
  setDidacticsHook(computeDidacticSignals);
});

describe("perf scenarios", () => {
  it("steps kepler-planet-only preset within budget", () => {
    const preset = getPresetById("kepler-planet-only");
    const system = preset.params;
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

  it("steps nbody-with-perturber preset within budget", () => {
    const preset = getPresetById("nbody-with-perturber");
    const system = preset.params;
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
