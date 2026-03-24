import { describe, expect, it } from "vitest";

import { deriveQuadraticLimbDarkeningFromStellarParams } from "../../src/photometry/limbDarkening";

describe("derived limb darkening", () => {
  it("derives stable quadratic coefficients from stellar parameters", () => {
    const law = deriveQuadraticLimbDarkeningFromStellarParams({
      teffK: 5772,
      loggCgs: 4.44,
      metallicityDex: 0,
      bandpass: "v",
    });

    expect(law.kind).toBe("quadratic");
    expect(Number.isFinite(law.u1)).toBe(true);
    expect(Number.isFinite(law.u2)).toBe(true);
    expect(law.u1).toBeGreaterThanOrEqual(0);
    expect(law.u2).toBeGreaterThanOrEqual(0);
    expect(law.u1 + law.u2).toBeLessThan(2);
  });
});
