import { describe, expect, it } from "vitest";
import { migrateScenarioJson } from "../../scripts/migrate-systemparams-v2";

describe("migrate-systemparams-v2", () => {
  it("migrates scenario defaults to v2 fields", () => {
    const src = {
      meta: { version: 1, schema: "SystemParams+Controls/v1" },
      defaults: {
        star: {
          r: 1,
          photometry: {
            atmosphereTransmission: { enabled: true, target: "planet", r0: 1, H: 2, tau0: 3 },
            phaseCurve: {
              thermalInertia: {
                enabled: true,
                albedo: 0.2,
                redistribution: 0.5,
                thermalTimescaleSec: 100,
              },
            },
          },
        },
        planet: { r: 1, orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 } },
      },
    };

    const migrated = migrateScenarioJson(src) as any;
    expect(migrated.meta.version).toBe(2);
    expect(migrated.meta.schema).toBe("SystemParamsV2+Controls/v2");
    expect(migrated.defaults.star.photometry.atmosphereRT.enabled).toBe(true);
    expect(migrated.defaults.star.photometry.thermalModelAdvanced.enabled).toBe(true);
    expect(migrated.defaults.didactics.enabled).toBe(true);
  });
});
