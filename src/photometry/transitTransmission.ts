// src/photometry/transitTransmission.ts

//
// Transmissive / fuzzy-edge transit photometry for a star disk with one or more occulters.
//
// Scientific model (summary):
// - Star is a projected disk of radius R=rStar in the sky plane.
// - Local specific intensity is I(mu) (optional limb darkening) multiplied by an
//   optional brightness map P(x,y) (spots/faculae).
// - Each occulter applies a multiplicative transmission T_i(rho_i) with rho_i the sky-plane
//   distance to occulter center.
// - Total transmission is product: T_total = Π_i T_i.
// - Returned quantity is normalized attenuation factor:
//   F = (∫ I * P * T_total dA) / (∫ I * P dA)
//
// Numerics:
// - Deterministic midpoint integration on a Cartesian grid over [-R,+R]^2.
// - Samples outside the stellar disk are skipped.
// - Complexity O(N^2 * N_occulters), where N≈gridRes.
//
// Limitation:
// - Thin structures (< rStar/gridRes) may suffer from aliasing. Increase gridRes for rings.
//
// Notes:
// - The constant cell area cancels in the ratio, so we can omit multiplying by it for numerical stability.

import type { BrightnessPatch, LimbDarkeningLaw } from "../core/types";
import { clamp01, isFiniteNonNegative, isFinitePositive } from "../core/units";
import { clampGridRes } from "./occulterCircle";
import { intensityNonNegative } from "./limbDarkening";
import { patchFactorAt, sanitizeBrightnessPatches, type PatchCombineMode, type PatchPre } from "./patches";

export type TransmissionOcculter = {
  /** Sky-plane offset of occulter center relative to star center (same units as rStar). */
  dx: number;
  dy: number;

  /**
   * Reference opaque radius (solid body).
   * Optional for purely fuzzy occulters; if present, can be used by helper transmission models.
   */
  r0?: number;

  /**
   * Transmission function T(rho) (typically in [0,1]), rho >= 0.
   *
   * If omitted:
   * - If r0 is finite and >0: defaults to a hard opaque disk (T=0 inside r0, else 1).
   * - Else: defaults to no effect (T=1).
   */
  transmission?: (rho: number) => number;
};

export type FluxStarWithTransmissionParams = {
  rStar: number;
  occulters: TransmissionOcculter[];
  /** Optional limb-darkening law. If omitted, intensity is uniform across the disk. */
  limbDarkening?: LimbDarkeningLaw;
  /** Optional projected brightness patches (spots/faculae), multiplicative in intensity. */
  brightnessPatches?: BrightnessPatch[];
  /** Patch combination policy. Default: "multiply" (backwards compatible). */
  patchCombineMode?: PatchCombineMode;
  /** Grid resolution ~ number of samples across the stellar diameter. */
  gridRes?: number;
  /**
   * Numerical safety.
   * If true (default): clamp transmission values and final flux to [0,1].
   */
  clamp01?: boolean;
  /**
   * Optional early-exit threshold:
   * - If T_total falls below this value at a point, short-circuit remaining occulters for that point
   *   (strictly safe when transmission is clamped to [0,1]).
   * - Default: 0 (no early-exit beyond exact zero).
   */
  earlyExitTMin?: number;
};

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function safeTransmissionValue(x: number, doClamp: boolean): number {
  // Non-finite transmission should behave like "no effect" to avoid blowing up the integral.
  if (!Number.isFinite(x)) return 1;
  return doClamp ? clamp01(x) : x;
}

function intensityAtMu(mu: number, ld: LimbDarkeningLaw | undefined): number {
  if (!ld) return 1;
  return intensityNonNegative(mu, ld);
}

function hardDiskTransmission(rho: number, r0: number, doClamp: boolean): number {
  if (!Number.isFinite(rho) || rho < 0) return 1;
  if (!Number.isFinite(r0) || r0 <= 0) return 1;
  const T = rho <= r0 ? 0 : 1;
  return doClamp ? clamp01(T) : T;
}

/**
 * Total transmission T_total(x,y) = Π_i T_i(rho_i).
 *
 * Consistency:
 * - For hard disks, this product equals the union mask.
 */
function transmissionAtPoint(params: {
  x: number;
  y: number;
  occulters: TransmissionOcculter[];
  doClamp: boolean;
  earlyExitTMin: number;
}): number {
  const { x, y, occulters, doClamp, earlyExitTMin } = params;

  if (!Array.isArray(occulters) || occulters.length === 0) return 1;

  let Ttot = 1;
  for (const o of occulters) {
    if (!o) continue;
    if (!Number.isFinite(o.dx) || !Number.isFinite(o.dy)) continue;

    const rho = Math.hypot(x - o.dx, y - o.dy);

    let Ti =
      typeof o.transmission === "function"
        ? safeTransmissionValue(o.transmission(rho), doClamp)
        : isFinitePositive(o.r0)
          ? hardDiskTransmission(rho, o.r0, doClamp)
          : 1;

    // Minimal guard even when doClamp===false:
    if (!Number.isFinite(Ti)) Ti = 1;

    if (doClamp) Ti = clamp01(Ti);
    Ttot *= Ti;

    // Early exit is strictly safe when Ti ∈ [0,1] (i.e. doClamp true).
    if (Ttot <= earlyExitTMin) return doClamp ? 0 : Ttot;
    if (Ttot === 0) return 0;
  }

  return doClamp ? clamp01(Ttot) : Ttot;
}

/**
 * Compute normalized stellar flux factor with transmissive occulters.
 *
 * Returns:
 * - Multiplicative attenuation factor F (typically in [0,1]) normalized to the same star
 *   with the same limb darkening and patch map but without occulters.
 */
export function fluxStarWithTransmissiveOcculters(params: FluxStarWithTransmissionParams): number {
  const rStar = params.rStar;
  if (!isFinitePositive(rStar)) {
    throw new Error("fluxStarWithTransmissiveOcculters: rStar must be > 0 and finite.");
  }

  const doClamp = params.clamp01 !== false;

  // Deterministic, bounded resolution using the canonical clampGridRes policy.
  // Keep minRes=16 here to preserve the performance envelope of this (square-grid) integrator.
  const N = clampGridRes(isFiniteNumber(params.gridRes) ? Math.floor(params.gridRes) : params.gridRes, 256, {
    minRes: 16,
    maxRes: 4096,
  });

  const occulters = params.occulters ?? [];
  const ld = params.limbDarkening;

  // Shared patch logic.
  const patches: PatchPre[] = sanitizeBrightnessPatches(params.brightnessPatches);
  const patchCombineMode: PatchCombineMode = params.patchCombineMode ?? "multiply";

  // Early-exit threshold, only meaningful in clamped/physical regime.
  const earlyExitTMinRaw = isFiniteNonNegative(params.earlyExitTMin) ? params.earlyExitTMin : 0;
  const earlyExitTMin = doClamp ? clamp01(earlyExitTMinRaw) : earlyExitTMinRaw;

  const rStar2 = rStar * rStar;

  // Midpoint grid over bounding square [-R, +R]^2.
  // NOTE: Known accuracy trade-off — this uses a square grid rather than a
  // chord-clipped grid.  Cells outside the stellar disk are skipped via the
  // r2 > rStar2 check below, but the grid points are still uniformly spaced
  // over the bounding square.  The accuracy difference is minor at high
  // gridRes values (the corner cells contribute negligible area).
  const L = 2 * rStar;
  const step = L / N;
  const half = 0.5 * step;

  let sumI = 0; // ∫ I*P dA (up to constant cellArea)
  let sumIT = 0; // ∫ I*P*T dA (up to constant cellArea)

  for (let iy = 0; iy < N; iy++) {
    const y = -rStar + half + iy * step;
    const y2 = y * y;

    for (let ix = 0; ix < N; ix++) {
      const x = -rStar + half + ix * step;
      const r2 = x * x + y2;

      if (r2 > rStar2) continue;

      // mu = sqrt(1 - (r/R)^2)
      const mu = Math.sqrt(Math.max(0, 1 - r2 / rStar2));

      // Base intensity (relative to disk center).
      let I = intensityAtMu(mu, ld);

      // Apply patches (multiplicative factor).
      const Praw = patchFactorAt(x, y, patches, patchCombineMode);
      const P = Number.isFinite(Praw) ? Math.max(0, Praw) : 1;
      I *= P;

      // Physical guard: negative intensity is non-physical.
      const Ipos = Number.isFinite(I) && I > 0 ? I : 0;

      if (Ipos === 0) continue;
      sumI += Ipos;

      const T = transmissionAtPoint({
        x,
        y,
        occulters,
        doClamp,
        earlyExitTMin,
      });
      sumIT += Ipos * T;
    }
  }

  // Degenerate normalization: fall back to "no transit" to avoid division by 0.
  if (!(sumI > 0) || !Number.isFinite(sumI) || !Number.isFinite(sumIT)) {
    return 1;
  }

  const f = sumIT / sumI;
  return doClamp ? clamp01(f) : f;
}

/** Helper: hard opaque disk occulter. */
function hardDiskOcculter(dx: number, dy: number, r: number): TransmissionOcculter {
  return {
    dx,
    dy,
    r0: r,
    transmission: (rho: number) => (rho <= r ? 0 : 1),
  };
}

/**
 * Helper: "opaque core + exponential halo" absorption model.
 *
 * Model:
 * - For rho <= r0: T = 0
 * - For rho > r0:
 *     tau(rho) = tau0 * exp(-(rho - r0)/h)
 *     T(rho) = exp(-tau(rho))
 */
function exponentialHaloOcculter(params: {
  dx: number;
  dy: number;
  r0: number;
  h: number;
  tau0: number;
  /** Optional cap for tau to avoid exp(-tau) underflow. Default: 60. */
  tauMax?: number;
}): TransmissionOcculter {
  const { dx, dy, r0, h, tau0 } = params;
  const tauMax = isFiniteNonNegative(params.tauMax) ? params.tauMax : 60;

  return {
    dx,
    dy,
    r0,
    transmission: (rho: number) => {
      if (!Number.isFinite(rho) || rho < 0) return 1;
      if (!Number.isFinite(r0) || r0 <= 0) return 1;

      // Opaque core:
      if (rho <= r0) return 0;

      const hh = Number.isFinite(h) ? h : NaN;
      const t0 = Number.isFinite(tau0) ? tau0 : NaN;

      if (!(hh > 0) || !(t0 >= 0)) return 1;

      const tau = t0 * Math.exp(-(rho - r0) / hh);
      if (!Number.isFinite(tau) || tau <= 0) return 1;

      const t = Math.min(tau, tauMax);
      const T = Math.exp(-t);
      return Number.isFinite(T) ? T : 1;
    },
  };
}

// ---------------------------
// Minimal built-in tests
// ---------------------------

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`transitTransmission self-test failed: ${msg}`);
}

function approxLe(a: number, b: number, eps = 1e-12): boolean {
  return a <= b + eps;
}

/**
 * Self-tests:
 * - Monotonicity: increasing tau0 in exponentialHaloOcculter should not increase flux for fixed geometry.
 * - Hard disk sanity: flux < 1 when an opaque disk overlaps the star.
 */
export function runTransitTransmissionSelfTests(): void {
  const rStar = 1;
  const gridRes = 400;

  // Occulter near center so halo overlaps the star strongly.
  const dx = 0.2;
  const dy = 0.0;
  const r0 = 0.3;
  const h = 0.15;

  const baseParams: FluxStarWithTransmissionParams = {
    rStar,
    gridRes,
    occulters: [],
    clamp01: true,
  };

  const f0 = fluxStarWithTransmissiveOcculters({
    ...baseParams,
    occulters: [exponentialHaloOcculter({ dx, dy, r0, h, tau0: 0 })],
  });

  const f1 = fluxStarWithTransmissiveOcculters({
    ...baseParams,
    occulters: [exponentialHaloOcculter({ dx, dy, r0, h, tau0: 0.5 })],
  });

  const f2 = fluxStarWithTransmissiveOcculters({
    ...baseParams,
    occulters: [exponentialHaloOcculter({ dx, dy, r0, h, tau0: 2.0 })],
  });

  assert(Number.isFinite(f0) && Number.isFinite(f1) && Number.isFinite(f2), "Flux must be finite.");
  assert(approxLe(f1, f0), "Monotonicity violated: tau0=0.5 should not yield higher flux than tau0=0.");
  assert(approxLe(f2, f1), "Monotonicity violated: tau0=2.0 should not yield higher flux than tau0=0.5.");

  const fh = fluxStarWithTransmissiveOcculters({
    rStar,
    gridRes,
    occulters: [hardDiskOcculter(0, 0, 0.3)],
    clamp01: true,
  });

  assert(fh < 1, "Hard-disk occulter should produce a transit (flux<1).");
}
