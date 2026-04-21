import { describe, expect, it } from "vitest";

import {
  deriveQuadraticLimbDarkeningFromStellarParams,
  resolveAndValidateLimbDarkeningForStar,
} from "../../src/photometry/limbDarkening";

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

  it("prefers star-specific stellar inputs over the shared default law", () => {
    const law = resolveAndValidateLimbDarkeningForStar({
      model: {
        default: { kind: "quadratic", u1: 0.2, u2: 0.1 },
        bandpass: "g",
      },
      star: {
        teffK: 6_500,
        loggCgs: 4.1,
        metallicityDex: -0.1,
        bandpass: "g",
      },
    });

    expect(law).toBeDefined();
    expect(law?.kind).toBe("quadratic");
    expect(law).not.toEqual({ kind: "quadratic", u1: 0.2, u2: 0.1 });
  });
});
