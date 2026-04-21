// src/photometry/random.ts
//
// Deterministic PRNG + sampling utilities for photometry/instrument-noise layers.
//
// Goals:
// - Deterministic (seeded) pseudo-random numbers for repeatable simulations and tests.
// - No external dependencies.
// - Numerically robust (avoid log(0), NaN propagation where feasible).
// - Fast enough for per-frame sampling (noise, AR/OU processes, etc.).
//
// Determinism / seed handling:
// - createMulberry32(seed) maps any JS value to a uint32 internal state via toSeed32(...).
// - State 0 is avoided (mapped to 1) to prevent a degenerate fixed point in some PRNG patterns.
// - setState(...) resets both the uniform stream state and the cached Box–Muller spare,
//   so replayed sequences are identical given the same state.
//
// Distribution notes:
// - u01() returns U in [0,1) with 2^-32 granularity (u32 / 2^32).
// - n01() returns N(0,1) using Box–Muller on two u01() draws.
//   It clamps u1 away from 0 to avoid log(0), guaranteeing finiteness.

export type PRNG = {
  /** Uniform in [0,1). */
  u01(): number;

  /** Standard normal N(0,1). */
  n01(): number;

  /** Unsigned 32-bit integer. */
  u32(): number;

  /** Set internal state (useful for deterministic replays). */
  setState(state: number): void;

  /** Get internal state (useful for checkpointing). */
  getState(): number;
};

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function toSeed32(seed: unknown, fallback = 1): number {
  const n = isFiniteNumber(seed) ? seed : Number(seed);
  const s = Number.isFinite(n) ? Math.floor(n) : fallback;

  // Force into uint32; avoid 0-state degeneracy by mapping 0 -> 1.
  const u = s >>> 0 || 1;
  return u;
}

/**
 * Mulberry32 PRNG (fast, decent quality for simulation/noise).
 * Period: 2^32.
 *
 * Notes:
 * - Not cryptographic; intended for deterministic simulation noise.
 * - u32() uses Math.imul for exact 32-bit multiplication semantics in JS.
 */
export function createMulberry32(seed: unknown = 1): PRNG {
  let a = toSeed32(seed, 1);

  // Box–Muller cache for n01()
  let spare: number | null = null;

  const u32 = (): number => {
    // mulberry32 step (returns uint32)
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;

    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return (t ^ (t >>> 14)) >>> 0;
  };

  // Uniform U in [0,1) with 2^-32 resolution.
  const u01 = (): number => u32() / 4294967296; // 2^32

  const n01 = (): number => {
    if (spare !== null) {
      const z = spare;
      spare = null;
      return z;
    }

    // Box–Muller: z0,z1 = sqrt(-2 ln u1) * (cos 2πu2, sin 2πu2)
    // Need u1 in (0,1] to avoid log(0). Clamp u1 away from 0.
    let u1 = u01();
    const u2 = u01();

    if (u1 < 1e-12) u1 = 1e-12;

    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;

    const z0 = r * Math.cos(theta);
    const z1 = r * Math.sin(theta);

    spare = z1;
    return z0;
  };

  return {
    u01,
    n01,
    u32,
    setState(state: number) {
      a = toSeed32(state, 1);
      spare = null; // reset cache for deterministic replay
    },
    getState() {
      return a >>> 0;
    },
  };
}

/**
 * Draw from Normal(mean, sigma).
 * Returns mean if sigma is non-finite or <= 0.
 *
 * Always consumes one n01() draw to keep the PRNG stream consistent
 * regardless of whether sigma is positive.
 */
export function normal(rng: PRNG, mean = 0, sigma = 1): number {
  if (!isFiniteNumber(mean)) return NaN;

  // Always advance the PRNG to maintain stream consistency.
  const z = rng.n01();

  if (!isFiniteNumber(sigma) || sigma <= 0) return mean;

  const out = mean + sigma * z;
  return Number.isFinite(out) ? out : NaN;
}

/**
 * Poisson(lambda) integer deviate.
 *
 * Hybrid implementation:
 * - For lambda < 15: Knuth exact algorithm (stable and exact, but linear in lambda).
 * - For lambda >= 15: Normal approximation N(lambda, lambda) rounded with continuity correction, clamped to >=0.
 *
 * The threshold was lowered from 50 to 15 because the Knuth algorithm suffers from
 * floating-point underflow for lambda in the 15-30 range (exp(-lambda) underflows),
 * producing biased results. The normal approximation is accurate for lambda >= 15.
 *
 * Returns 0 if lambda is non-finite or <=0.
 */
export function poisson(rng: PRNG, lambda: number): number {
  if (!isFiniteNumber(lambda) || lambda <= 0) return 0;

  // Small-lambda exact Poisson via Knuth
  if (lambda < 15) {
    const L = Math.exp(-lambda);

    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rng.u01();
      // If p underflows to 0, the loop ends quickly (fine).
    } while (p > L);

    return k - 1;
  }

  // Large-lambda: Normal approximation with continuity correction.
  const z = rng.n01();
  const x = lambda + Math.sqrt(lambda) * z;
  const k = Math.floor(x + 0.5);
  return Math.max(0, k);
}

/**
 * OU / AR(1) step:
 *   x(t+dt) = a x(t) + b z, where z ~ N(0,1)
 *   a = exp(-dt/tau)
 *   b = sigma * sqrt(1 - a^2)
 *
 * Here sigma is the stationary RMS of the OU process.
 */
export function ouStep(rng: PRNG, prev: number, dtSec: number, tauSec: number, sigma: number): number {
  const dt = isFiniteNumber(dtSec) ? Math.max(0, dtSec) : NaN;
  const tau = isFiniteNumber(tauSec) ? Math.max(1e-9, tauSec) : NaN;

  if (!isFiniteNumber(prev) || !isFiniteNumber(dt) || !isFiniteNumber(tau) || !isFiniteNumber(sigma))
    return NaN;
  if (sigma <= 0) return prev;
  if (dt === 0) return prev;

  const a = Math.exp(-dt / tau);
  const b = sigma * Math.sqrt(Math.max(0, 1 - a * a));

  return a * prev + b * rng.n01();
}

/**
 * Random walk step:
 *   x(t+dt) = x(t) + sigma * sqrt(dt) * z
 *
 * Where sigma is in units per sqrt(second).
 */
export function randomWalkStep(rng: PRNG, prev: number, dtSec: number, sigmaPerSqrtSec: number): number {
  const dt = isFiniteNumber(dtSec) ? Math.max(0, dtSec) : NaN;

  if (!isFiniteNumber(prev) || !isFiniteNumber(dt) || !isFiniteNumber(sigmaPerSqrtSec)) return NaN;
  if (sigmaPerSqrtSec <= 0 || dt === 0) return prev;

  return prev + sigmaPerSqrtSec * Math.sqrt(dt) * rng.n01();
}

// ---------------------------
// Minimal built-in tests
// ---------------------------

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`random self-test failed: ${msg}`);
}

function approxEq(a: number, b: number, eps = 1e-12): boolean {
  return Math.abs(a - b) <= eps;
}

/**
 * Self-tests:
 * - Determinism: same seed => same u32 sequence.
 * - State restore: getState/setState reproduce the u32 stream exactly.
 * - Range: u01 in [0,1), n01 finite.
 * - Cache determinism: setState resets Box–Muller cache.
 */
export function runRandomSelfTests(): void {
  const r1 = createMulberry32(123);
  const r2 = createMulberry32(123);
  for (let i = 0; i < 10; i++) {
    const a = r1.u32();
    const b = r2.u32();
    assert(a === b, "Same seed must produce same u32 sequence.");
  }

  const r3 = createMulberry32(999);
  const s0 = r3.getState();
  const x0 = r3.u32();
  const x1 = r3.u32();

  r3.setState(s0);
  const y0 = r3.u32();
  const y1 = r3.u32();
  assert(x0 === y0 && x1 === y1, "setState(getState()) must reproduce the u32 stream.");

  const r4 = createMulberry32(42);
  const u = r4.u01();
  assert(Number.isFinite(u) && u >= 0 && u < 1, "u01 must be in [0,1).");

  const z = r4.n01();
  assert(Number.isFinite(z), "n01 must be finite.");

  // Ensure setState clears Box–Muller cache and the next n01() sequence is deterministic:
  const r5 = createMulberry32(7);
  void r5.n01(); // consume one pair so we are at a known stream position
  const stateAfter = r5.getState();

  r5.setState(stateAfter);
  const zB1 = r5.n01();
  const zB2 = r5.n01();
  r5.setState(stateAfter);
  const zB1b = r5.n01();
  const zB2b = r5.n01();
  assert(
    approxEq(zB1, zB1b, 0) && approxEq(zB2, zB2b, 0),
    "Cache reset + same underlying state must reproduce n01 draws.",
  );
}
