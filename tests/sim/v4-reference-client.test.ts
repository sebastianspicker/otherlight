import { describe, expect, it } from "vitest";

import { buildBinaryLabParams } from "../../src/app/binaryLab";
import { migrateSystemParamsToV4 } from "../../src/sim/v4";
import { createReferenceSimulationV4 } from "../../src/sim/v4/referenceClient";

describe("v4 reference client", () => {
  it("uses the in-thread deterministic reference runtime", async () => {
    const cfg = migrateSystemParamsToV4(buildBinaryLabParams());
    cfg.runtime = { ...(cfg.runtime ?? {}), mode: "reference" };

    const runtime = createReferenceSimulationV4(cfg);
    await runtime.prepare();

    const step = runtime.step(42);

    expect(Number.isFinite(step.flux.total)).toBe(true);
    expect(runtime.getMode()).toBe("reference");
    expect(runtime.takeStatusMessage()).toContain("in-thread deterministic runtime");
  });

  it("preserves mode changes on the wrapped runtime", async () => {
    const cfg = migrateSystemParamsToV4(buildBinaryLabParams());
    cfg.runtime = { ...(cfg.runtime ?? {}), mode: "reference" };

    const runtime = createReferenceSimulationV4(cfg);
    runtime.setMode("realtime");

    expect(runtime.getMode()).toBe("realtime");
    expect(Number.isFinite(runtime.step(10).flux.total)).toBe(true);
  });

  it("throws after dispose", async () => {
    const cfg = migrateSystemParamsToV4(buildBinaryLabParams());
    const runtime = createReferenceSimulationV4(cfg);
    await runtime.prepare();
    runtime.dispose();

    expect(() => runtime.step(1)).toThrow("disposed");
  });
});
