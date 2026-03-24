// tests/property/numerical-properties.test.ts
//
// Property-based tests for numerical correctness of core modules.
// Uses a deterministic xorshift128 PRNG seeded with 42 for full reproducibility.

import { describe, it, expect } from "vitest";
import { solveKeplerE } from "../../src/physics/kepler";
import { v3, vNormalizeOrZero, vLen, vDot, vCross, type Vec3 } from "../../src/physics/vec3";
import { fluxUniformDisk } from "../../src/photometry/transitUniform";
import { wrapToPi } from "../../src/core/units";

// ---------------------------------------------------------------------------
// Deterministic PRNG: xorshift128 seeded from a single 32-bit seed.
// ---------------------------------------------------------------------------

class Xorshift128 {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    // Expand a single 32-bit seed into four state words using a splitmix-style step.
    let s = seed >>> 0;
    this.s0 = s = (s + 0x9e3779b9) >>> 0;
    this.s1 = s = (s ^ (s >>> 16)) >>> 0;
    this.s2 = s = (s + 0x9e3779b9) >>> 0;
    this.s3 = (s ^ (s >>> 16)) >>> 0;
    // Warm up the generator.
    for (let i = 0; i < 20; i++) this.nextUint32();
  }

  /** Return a 32-bit unsigned integer. */
  nextUint32(): number {
    let t = this.s3;
    const s = this.s0;
    this.s3 = this.s2;
    this.s2 = this.s1;
    this.s1 = s;
    t ^= t << 11;
    t ^= t >>> 8;
    this.s0 = t ^ s ^ (s >>> 19);
    return this.s0 >>> 0;
  }

  /** Return a float uniformly in [0, 1). */
  next(): number {
    return this.nextUint32() / 0x100000000;
  }

  /** Return a float uniformly in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }
}

// ---------------------------------------------------------------------------
// 1. Kepler equation solver
// ---------------------------------------------------------------------------

describe("Property: Kepler equation solver", () => {
  const rng = new Xorshift128(42);
  const N = 500;
  const TWO_PI = 2 * Math.PI;

  it("round-trip: E - e*sin(E) recovers M within 1e-10 for 500 random (M, e)", () => {
    for (let i = 0; i < N; i++) {
      const M = rng.range(0, TWO_PI);
      const e = rng.range(0, 0.99);

      const E = solveKeplerE(M, e, { maxIters: 60, tol: 1e-12 });

      // Recompute M from E. Note: solveKeplerE works on wrapToPi(M), so
      // we compare against the wrapped value.
      const Mw = wrapToPi(M);
      const Mback = E - e * Math.sin(E);

      expect(Math.abs(Mback - Mw)).toBeLessThanOrEqual(1e-10);
    }
  });

  it("E(M=0, e) = 0 for 500 random eccentricities", () => {
    const rng2 = new Xorshift128(42);
    for (let i = 0; i < N; i++) {
      const e = rng2.range(0, 0.99);
      const E = solveKeplerE(0, e);
      expect(Math.abs(E)).toBeLessThanOrEqual(1e-10);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Vector operations
// ---------------------------------------------------------------------------

describe("Property: Vec3 operations", () => {
  const rng = new Xorshift128(42);
  const N = 500;

  function randomVec(): Vec3 {
    return v3(rng.range(-100, 100), rng.range(-100, 100), rng.range(-100, 100));
  }

  /** Generate a non-zero random vector (reject near-zero). */
  function randomNonZeroVec(): Vec3 {
    for (;;) {
      const v = randomVec();
      if (vLen(v) > 1e-6) return v;
    }
  }

  it("|normalize(v)| = 1 for 500 random non-zero vectors (within 1e-10)", () => {
    for (let i = 0; i < N; i++) {
      const v = randomNonZeroVec();
      const n = vNormalizeOrZero(v);
      const len = vLen(n);
      expect(Math.abs(len - 1)).toBeLessThanOrEqual(1e-10);
    }
  });

  it("dot(v, cross(v, w)) = 0 for 500 random pairs (within 1e-10)", () => {
    for (let i = 0; i < N; i++) {
      const v = randomNonZeroVec();
      const w = randomNonZeroVec();
      const c = vCross(v, w);
      const d = vDot(v, c);

      // The triple product magnitude scales with |v|^2 * |w|, so we use a
      // relative tolerance: |dot| / (|v|^2 * |w|) should be tiny.
      const scale = vLen(v) * vLen(v) * vLen(w);
      if (scale > 1e-12) {
        expect(Math.abs(d) / scale).toBeLessThanOrEqual(1e-10);
      } else {
        // If vectors are tiny, absolute zero is fine.
        expect(Math.abs(d)).toBeLessThanOrEqual(1e-10);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Transit flux
// ---------------------------------------------------------------------------

describe("Property: Transit flux (uniform disk)", () => {
  const rng = new Xorshift128(42);
  const N = 200;

  it("flux is always in [0, 1] for 200 random valid configurations", () => {
    for (let i = 0; i < N; i++) {
      const rStar = rng.range(0.1, 10);
      const rOcc = rng.range(0.01, 5);
      const d = rng.range(0, 20);
      const theta = rng.range(0, 2 * Math.PI);
      const dx = d * Math.cos(theta);
      const dy = d * Math.sin(theta);

      const flux = fluxUniformDisk({
        rStar,
        rOcculters: [{ dx, dy, r: rOcc }],
      });

      expect(flux).toBeGreaterThanOrEqual(0);
      expect(flux).toBeLessThanOrEqual(1);
    }
  });

  it("flux = 1 when occulter does not overlap star (d > rStar + rOcc) for 200 random configs", () => {
    const rng2 = new Xorshift128(42);
    for (let i = 0; i < N; i++) {
      const rStar = rng2.range(0.1, 10);
      const rOcc = rng2.range(0.01, 5);
      // Ensure d is strictly greater than rStar + rOcc (with a small margin).
      const margin = rng2.range(0.01, 5);
      const d = rStar + rOcc + margin;
      const theta = rng2.range(0, 2 * Math.PI);
      const dx = d * Math.cos(theta);
      const dy = d * Math.sin(theta);

      const flux = fluxUniformDisk({
        rStar,
        rOcculters: [{ dx, dy, r: rOcc }],
      });

      expect(flux).toBe(1);
    }
  });
});
