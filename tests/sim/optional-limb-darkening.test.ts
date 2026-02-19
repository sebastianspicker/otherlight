import { describe, expect, it } from "vitest";

import { getLdIntegrators, preloadOptionalLimbDarkening } from "../../src/sim/optionalLimbDarkening";

describe("optional limb-darkening loader", () => {
  it("loads numeric LD integrators when optional modules are present", async () => {
    await preloadOptionalLimbDarkening();

    const ld = getLdIntegrators();
    expect(ld).not.toBeNull();
    expect(typeof ld!.fluxLimbDarkenedDisk).toBe("function");
    expect(typeof ld!.resolveLimbDarkeningForBand).toBe("function");

    const f = ld!.fluxLimbDarkenedDisk({
      rStar: 1,
      rOcculters: [{ dx: 0, dy: 0, r: 0.2 }],
      limbDarkeningLaw: { kind: "quadratic", u1: 0.35, u2: 0.25 },
      gridRes: 80,
    });
    expect(Number.isFinite(f)).toBe(true);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(1);
  });
});
