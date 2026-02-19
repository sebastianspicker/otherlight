import { describe, expect, it } from "vitest";

import { migrateScenarioJsonToV4, migrateSystemParamsV4 } from "../../scripts/migrate-systemparams-v4";

describe("migrate-systemparams-v4", () => {
  it("migrates a v2-style single-star system into v4 binary schema", () => {
    const src = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 6.957e8, m: 1.98847e30, photometry: { baselineFlux: 1 } },
      planet: {
        r: 6.9911e7,
        m: 1.89813e27,
        orbit: { a: 7.4e9, e: 0.05, inc: 1.5, Omega: 0.1, omega: 0.2, period: 3.0e5, t0: 0 },
      },
      moon: {
        r: 6.371e6,
        m: 5.9722e24,
        orbitAroundPlanet: { a: 2e8, e: 0.01, inc: 0.1, Omega: 0.2, omega: 0.3, period: 5e4, t0: 0 },
      },
    };

    const out = migrateSystemParamsV4(src as any);

    expect(out.version).toBe("4");
    expect(out.bodies.stars).toHaveLength(2);
    expect(out.bodies.stars[0].id).toBe("star-a");
    expect(out.bodies.stars[0].r).toBe(src.star.r);
    expect(out.bodies.stars[1].id).toBe("star-b");
    expect(out.bodies.planets).toHaveLength(1);
    expect(out.bodies.planets[0].id).toBe("planet-1");
    expect(out.bodies.moons).toHaveLength(1);
    expect(out.bodies.moons[0].parentPlanetId).toBe("planet-1");
    expect(out.orbits.hierarchy.find((h: any) => h.childId === "planet-1")?.parentId).toBe("star-a");
  });

  it("migrates scenario envelope meta to v4", () => {
    const src = {
      meta: { version: 2, schema: "SystemParamsV2+Controls/v2" },
      defaults: {
        star: { r: 1, photometry: {} },
        planet: { r: 1, orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 } },
      },
    };

    const out = migrateScenarioJsonToV4(src as any) as any;

    expect(out.meta.version).toBe(4);
    expect(out.meta.schema).toBe("SystemParamsV4+Controls/v4");
    expect(out.defaults.version).toBe("4");
    expect(Array.isArray(out.defaults.bodies.stars)).toBe(true);
  });
});
