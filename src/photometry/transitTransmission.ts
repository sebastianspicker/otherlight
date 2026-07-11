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
import { clamp01, isFiniteNonNegative, isFiniteNumber, isFinitePositive } from "../core/units";
import { clampGridRes } from "./occulterCircle";
import { intensityNonNegative } from "./limbDarkening";
import { patchFactorAt, sanitizeBrightnessPatches, type PatchCombineMode, type PatchPre } from "./patches";
import { transmissionAtPoint } from "./transitTransmissionPoint";

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

function intensityAtMu(mu: number, ld: LimbDarkeningLaw | undefined): number {
  if (!ld) return 1;
  return intensityNonNegative(mu, ld);
}

type TransmissionGrid = {
  N: number;
  rStar2: number;
  step: number;
  half: number;
};

type TransmissionFluxContext = {
  rStar: number;
  grid: TransmissionGrid;
  occulters: TransmissionOcculter[];
  limbDarkening?: LimbDarkeningLaw;
  patches: PatchPre[];
  patchCombineMode: PatchCombineMode;
  doClamp: boolean;
  earlyExitTMin: number;
};

function transmissionGrid(params: FluxStarWithTransmissionParams): TransmissionGrid {
  const N = clampGridRes(isFiniteNumber(params.gridRes) ? Math.floor(params.gridRes) : params.gridRes, 256, {
    minRes: 32,
    maxRes: 4096,
  });
  const step = (2 * params.rStar) / N;
  return {
    N,
    rStar2: params.rStar * params.rStar,
    step,
    half: 0.5 * step,
  };
}

function earlyExitThreshold(value: number | undefined, doClamp: boolean): number {
  const raw = isFiniteNonNegative(value) ? value : 0;
  return doClamp ? clamp01(raw) : raw;
}

function transmissionFluxContext(params: FluxStarWithTransmissionParams): TransmissionFluxContext {
  if (!isFinitePositive(params.rStar)) {
    throw new Error("fluxStarWithTransmissiveOcculters: rStar must be > 0 and finite.");
  }
  const doClamp = params.clamp01 !== false;
  return {
    rStar: params.rStar,
    grid: transmissionGrid(params),
    occulters: params.occulters ?? [],
    limbDarkening: params.limbDarkening,
    patches: sanitizeBrightnessPatches(params.brightnessPatches),
    patchCombineMode: params.patchCombineMode ?? "multiply",
    doClamp,
    earlyExitTMin: earlyExitThreshold(params.earlyExitTMin, doClamp),
  };
}

function patchedIntensityAtPoint(context: TransmissionFluxContext, x: number, y: number, mu: number): number {
  const baseIntensity = intensityAtMu(mu, context.limbDarkening);
  const patch = patchFactorAt(x, y, context.patches, context.patchCombineMode);
  const patchFactor = Number.isFinite(patch) ? Math.max(0, patch) : 1;
  const intensity = baseIntensity * patchFactor;
  return Number.isFinite(intensity) && intensity > 0 ? intensity : 0;
}

function transmissionSample(
  context: TransmissionFluxContext,
  x: number,
  y: number,
  y2: number,
): { intensity: number; transmitted: number } | undefined {
  const r2 = x * x + y2;
  if (r2 > context.grid.rStar2) return undefined;
  const mu = Math.sqrt(Math.max(0, 1 - r2 / context.grid.rStar2));
  const intensity = patchedIntensityAtPoint(context, x, y, mu);
  if (intensity === 0) return undefined;
  const T = transmissionAtPoint({
    x,
    y,
    occulters: context.occulters,
    doClamp: context.doClamp,
    earlyExitTMin: context.earlyExitTMin,
  });
  return { intensity, transmitted: intensity * T };
}

function integrateTransmissiveDisk(context: TransmissionFluxContext): { sumI: number; sumIT: number } {
  let sumI = 0;
  let sumIT = 0;
  for (let iy = 0; iy < context.grid.N; iy++) {
    const y = -context.rStar + context.grid.half + iy * context.grid.step;
    const y2 = y * y;
    for (let ix = 0; ix < context.grid.N; ix++) {
      const x = -context.rStar + context.grid.half + ix * context.grid.step;
      const sample = transmissionSample(context, x, y, y2);
      if (!sample) continue;
      sumI += sample.intensity;
      sumIT += sample.transmitted;
    }
  }
  return { sumI, sumIT };
}

function finalizeTransmissiveFlux(sums: { sumI: number; sumIT: number }, doClamp: boolean): number {
  if (!(sums.sumI > 0) || !Number.isFinite(sums.sumI) || !Number.isFinite(sums.sumIT)) return 1;
  const f = sums.sumIT / sums.sumI;
  return doClamp ? clamp01(f) : f;
}

/**
 * Compute normalized stellar flux factor with transmissive occulters.
 *
 * Returns:
 * - Multiplicative attenuation factor F (typically in [0,1]) normalized to the same star
 *   with the same limb darkening and patch map but without occulters.
 */
export function fluxStarWithTransmissiveOcculters(params: FluxStarWithTransmissionParams): number {
  const context = transmissionFluxContext(params);
  return finalizeTransmissiveFlux(integrateTransmissiveDisk(context), context.doClamp);
}
