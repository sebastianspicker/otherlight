import { describe, expect, it } from "vitest";

import { migrateScenarioJsonToV4 } from "../../scripts/migrate-systemparams-v4";

describe("migration regression", () => {
  it("migrates scenario envelope defaults to v4 schema", () => {
    const src = {
      meta: { version: 2, schema: "SystemParams/v2" },
      defaults: {
        star: { r: 6.957e8, m: 1.98847e30 },
        planet: {
          r: 6.5e8,
          m: 1.2e30,
          orbit: { a: 1.4e10, e: 0, inc: 1.55, Omega: 0, omega: 0, period: 8e5, t0: 0 },
        },
        observer: { dir: { x: 1, y: 0, z: 1 } },
      },
    };

    const out = migrateScenarioJsonToV4(src) as any;
    expect(out.meta.version).toBe(4);
    expect(out.meta.schema).toContain("v4");
    expect(out.defaults.version).toBe("4");
  });
});
