/** Verifies fail-open policies keep application failures visible and recoverable. */

import { describe, expect, it } from "vitest";

import { computeTransitFlux } from "../../src/sim/transitFlux";
import { assertStepInputs } from "../../src/sim/validation/assertions";
import { sanitizeStaticOrbit } from "../../src/sim/v4/orbitSanitizer";
import { resolveLimbDarkeningForBand } from "../../src/photometry/limbDarkening";
import type { SystemParams, LimbDarkeningModel } from "../../src/core/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid orbit elements for building test params. */
const VALID_ORBIT = {
  a: 1e11,
  e: 0,
  inc: Math.PI / 2,
  Omega: 0,
  omega: 0,
  period: 86400,
  t0: 0,
} as const;

/** Build a minimal SystemParams for transit-flux tests. */
function makeParams(overrides?: { starR?: number }): SystemParams {
  return {
    star: { r: overrides?.starR ?? 1 },
    planet: { r: 0.1, orbit: { ...VALID_ORBIT } },
  };
}

/** Minimal BodyKinematics stub (planet behind star, so no transit). */
function makeKin() {
  return {
    planetOrbit: { ...VALID_ORBIT },
    rBary: { x: 0, y: 0, z: 0 },
    rPlanetAbs: { x: 0, y: 0, z: 0 },
    planetSky: { x: 0, y: 0, z: -1 },
  };
}

// ---------------------------------------------------------------------------
// 1. Transit flux fail-open
// ---------------------------------------------------------------------------

describe("computeTransitFlux error recovery", () => {
  it("throws for NaN star radius (fail-fast guard)", () => {
    const params = makeParams({ starR: NaN });
    expect(() => computeTransitFlux(params, [], makeKin())).toThrow();
  });

  it("returns 1.0 (no dimming) with empty occulters array", () => {
    const params = makeParams({ starR: 1 });
    const result = computeTransitFlux(params, [], makeKin());
    expect(result).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 2. Validation assertions
// ---------------------------------------------------------------------------

describe("assertStepInputs error recovery", () => {
  it("throws for missing star radius", () => {
    const params: SystemParams = {
      star: { r: undefined as any },
      planet: { r: 0.1, orbit: { ...VALID_ORBIT } },
    };
    expect(() => assertStepInputs(params, 0)).toThrow(/star\.r/);
  });

  it("throws for negative star radius", () => {
    const params: SystemParams = {
      star: { r: -1 },
      planet: { r: 0.1, orbit: { ...VALID_ORBIT } },
    };
    expect(() => assertStepInputs(params, 0)).toThrow(/star\.r/);
  });

  it("throws for NaN time value", () => {
    const params: SystemParams = {
      star: { r: 1 },
      planet: { r: 0.1, orbit: { ...VALID_ORBIT } },
    };
    expect(() => assertStepInputs(params, NaN)).toThrow(/t must be finite/);
  });
});

// ---------------------------------------------------------------------------
// 3. Orbit sanitizer
// ---------------------------------------------------------------------------

describe("sanitizeStaticOrbit edge cases", () => {
  it("replaces negative period with fallback default", () => {
    const result = sanitizeStaticOrbit({ a: 1e11, e: 0, inc: 0, Omega: 0, omega: 0, period: -100, t0: 0 });
    expect(result.period).toBe(1);
  });

  it("replaces eccentricity >= 1 with fallback default", () => {
    const result = sanitizeStaticOrbit({ a: 1e11, e: 1.5, inc: 0, Omega: 0, omega: 0, period: 86400, t0: 0 });
    expect(result.e).toBe(0);
  });

  it("replaces negative eccentricity and non-positive semimajor axis with fallback defaults", () => {
    const result = sanitizeStaticOrbit({ a: 0, e: -0.1, inc: 0, Omega: 0, omega: 0, period: 86400, t0: 0 });
    expect(result.a).toBe(1);
    expect(result.e).toBe(0);
  });

  it("replaces NaN period with fallback default", () => {
    const result = sanitizeStaticOrbit({ a: 1e11, e: 0, inc: 0, Omega: 0, omega: 0, period: NaN, t0: 0 });
    expect(result.period).toBe(1); // DEFAULT_BINARY_ORBIT.period = 1
  });

  it("replaces Infinity eccentricity with fallback default", () => {
    const result = sanitizeStaticOrbit({
      a: 1e11,
      e: Infinity,
      inc: 0,
      Omega: 0,
      omega: 0,
      period: 86400,
      t0: 0,
    });
    expect(result.e).toBe(0); // DEFAULT_BINARY_ORBIT.e = 0
  });

  it("returns fallback for non-object input", () => {
    const result = sanitizeStaticOrbit(null);
    expect(result.a).toBe(1);
    expect(result.e).toBe(0);
    expect(result.period).toBe(1);
  });

  it("passes through valid inputs unchanged", () => {
    const input = { a: 2e11, e: 0.3, inc: 1.2, Omega: 0.5, omega: 0.8, period: 172800, t0: 100 };
    const result = sanitizeStaticOrbit(input);
    expect(result.a).toBe(2e11);
    expect(result.e).toBe(0.3);
    expect(result.inc).toBe(1.2);
    expect(result.Omega).toBe(0.5);
    expect(result.omega).toBe(0.8);
    expect(result.period).toBe(172800);
    expect(result.t0).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 4. Limb darkening resolution
// ---------------------------------------------------------------------------

describe("resolveLimbDarkeningForBand error recovery", () => {
  it("returns undefined when model has no default, no bands, and no stellar", () => {
    const model: LimbDarkeningModel = {};
    const result = resolveLimbDarkeningForBand(model);
    expect(result).toBeUndefined();
  });

  it("returns undefined when bandpass references a missing band and no fallback exists", () => {
    const model: LimbDarkeningModel = {
      bands: {
        v: { kind: "quadratic", u1: 0.35, u2: 0.25 },
      },
    };
    // Request a band that does not exist and no default/stellar fallback.
    const result = resolveLimbDarkeningForBand(model, "z");
    expect(result).toBeUndefined();
  });

  it("returns valid law from default when present", () => {
    const model: LimbDarkeningModel = {
      default: { kind: "quadratic", u1: 0.4, u2: 0.2 },
    };
    const result = resolveLimbDarkeningForBand(model);
    expect(result).toBeDefined();
    expect(result!.kind).toBe("quadratic");
  });

  it("returns matching band law for valid model", () => {
    const model: LimbDarkeningModel = {
      bands: {
        v: { kind: "quadratic", u1: 0.35, u2: 0.25 },
        r: { kind: "quadratic", u1: 0.3, u2: 0.2 },
      },
    };
    const result = resolveLimbDarkeningForBand(model, "r");
    expect(result).toBeDefined();
    expect(result!.kind).toBe("quadratic");
    expect((result as any).u1).toBe(0.3);
  });
});
