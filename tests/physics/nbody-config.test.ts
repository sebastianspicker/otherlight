import { describe, expect, it } from "vitest";

import { G_SI } from "../../src/core/units";
import { resolveEnabledNBodyPlanetMoonConfig } from "../../src/sim/nbody/config";

describe("resolveEnabledNBodyPlanetMoonConfig", () => {
  it("computes mu from masses when mu is missing", () => {
    const cfg = {
      enabled: true,
      mStar: 2,
      mPlanet: 3,
      mMoon: 4,
      dtMax: 1,
    };

    const resolved = resolveEnabledNBodyPlanetMoonConfig(cfg, { onInvalid: "throw", G: G_SI });
    expect(resolved).not.toBeNull();
    expect(resolved!.muStar).toBeCloseTo(G_SI * 2, 12);
    expect(resolved!.muPlanet).toBeCloseTo(G_SI * 3, 12);
    expect(resolved!.muMoon).toBeCloseTo(G_SI * 4, 12);
  });

  it("uses mu when provided, even if masses are present", () => {
    const cfg = {
      enabled: true,
      muStar: 10,
      muPlanet: 20,
      muMoon: 30,
      mStar: 2,
      mPlanet: 3,
      mMoon: 4,
      dtMax: 1,
    };

    const resolved = resolveEnabledNBodyPlanetMoonConfig(cfg, { onInvalid: "throw", G: G_SI });
    expect(resolved).not.toBeNull();
    expect(resolved!.muStar).toBe(10);
    expect(resolved!.muPlanet).toBe(20);
    expect(resolved!.muMoon).toBe(30);
  });

  it("accepts masses from opts when cfg omits them", () => {
    const cfg = {
      enabled: true,
      dtMax: 1,
    };

    const resolved = resolveEnabledNBodyPlanetMoonConfig(cfg, {
      onInvalid: "throw",
      masses: { star: 2, planet: 3, moon: 4 },
      G: G_SI,
    });
    expect(resolved).not.toBeNull();
    expect(resolved!.muStar).toBeCloseTo(G_SI * 2, 12);
    expect(resolved!.muPlanet).toBeCloseTo(G_SI * 3, 12);
    expect(resolved!.muMoon).toBeCloseTo(G_SI * 4, 12);
  });
});
