import { describe, expect, it } from "vitest";

import { normalizeScenarioInputToV4 } from "../../src/sim/v4/migrate";
import { buildNativeSnapshot } from "../../src/sim/v4/nativeSnapshot";

describe("v4 runtime migration loader", () => {
  it("auto-migrates legacy v2-like payload to v4", () => {
    const legacy = {
      star: {
        r: 6.957e8,
        m: 1.98847e30,
        photometry: {
          forwardScattering: { enabled: true, amp: 0.04, kind: "gaussian-phase", sigmaPhase: 0.2 },
          ringScattering: { enabled: true, amp: 0.02, sigmaPhase: 0.15 },
        },
      },
      planet: {
        r: 6.5e8,
        m: 1.2e30,
        orbit: { a: 1.4e10, e: 0.05, inc: 1.55, Omega: 0, omega: 0, period: 8.0e5, t0: 0 },
      },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      binaryStars: {
        primary: { teffK: 6_200, loggCgs: 4.2, metallicityDex: -0.1, passband: "g" },
        secondary: {
          luminosityScale: 0.28,
          teffK: 5_300,
          loggCgs: 4.45,
          metallicityDex: -0.15,
          passband: "g",
        },
      },
    };

    const out = normalizeScenarioInputToV4(legacy);
    expect(out.version).toBe("4");
    expect(out.mode).toBe("general-lab");
    expect(out.runtime?.executionMode).toBe("interactive");
    expect(out.bodies.stars).toHaveLength(2);
    expect(out.bodies.planets).toHaveLength(1);
    expect(out.orbits.binary.period).toBe(8.0e5);
    expect(out.photometry?.forwardScattering).toEqual(legacy.star.photometry.forwardScattering);
    expect(out.photometry?.ringScattering).toEqual(legacy.star.photometry.ringScattering);
    expect(out.bodies.stars[0].teffK).toBe(6_200);
    expect(out.bodies.stars[0].passband).toBe("g");
    expect(out.bodies.stars[1].luminosityScale).toBeCloseTo(0.28, 12);
    expect(out.bodies.stars[1].teffK).toBe(5_300);
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

  it("accepts an explicit scientific-browser execution mode in valid V4 configs", () => {
    const legacy = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 6.957e8, m: 1.98847e30 },
      planet: {
        r: 6.371e6,
        m: 5.9722e24,
        orbit: { a: 1.4e10, e: 0.05, inc: 1.55, Omega: 0, omega: 0, period: 8.0e5, t0: 0 },
      },
    };
    const migrated = normalizeScenarioInputToV4(legacy);

    const out = normalizeScenarioInputToV4({
      ...migrated,
      runtime: {
        ...(migrated.runtime ?? {}),
        executionMode: "scientific-browser",
      },
    });

    expect(out.runtime?.executionMode).toBe("scientific-browser");
    expect(() => buildNativeSnapshot(out, 0)).not.toThrow();
  });

  it("keeps migrated general-lab secondary star dynamically inert", () => {
    const migrated = normalizeScenarioInputToV4({
      star: { r: 1, m: 1 },
      planet: {
        r: 0.1,
        m: 0,
        orbit: { a: 10, e: 0, inc: Math.PI / 2, Omega: 0, omega: 0, period: 100, t0: 0 },
      },
      observer: { dir: { x: 0, y: 0, z: 1 } },
    });

    const snapshot = buildNativeSnapshot(migrated, 25);
    const primary = snapshot.byId.get("star-a");
    const secondary = snapshot.byId.get("star-b");

    expect(secondary?.m).toBe(0);
    expect(primary?.rAbs.x).toBeCloseTo(0, 12);
    expect(primary?.rAbs.y).toBeCloseTo(0, 12);
    expect(primary?.vAbs.x).toBeCloseTo(0, 12);
    expect(primary?.vAbs.y).toBeCloseTo(0, 12);
  });
});
