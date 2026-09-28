/** Integrates fuzzy-edge and transmissive occultation across a limb-darkened disk. */

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

import type { BrightnessPatch, LimbDarkeningLaw } from "../model/types";
import { clamp01, isFiniteNonNegative, isFiniteNumber, isFinitePositive } from "../model/units";
import { clampGridRes, MAX_TRANSIT_GRID_RES } from "./occulterCircle";
import { intensityNonNegative } from "./limbDarkening";
import { patchFactorAt, sanitizeBrightnessPatches, type PatchCombineMode, type PatchPre } from "./patches";

type TransmissionOcculter = {
  /** Sky-plane offset of occulter center relative to star center (same units as rStar). */
  dx: number;
  dy: number;
  /** Reference opaque radius (solid body). */
  r0?: number;
  /** Transmission function T(rho) (typically in [0,1]), rho >= 0. */
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
  /** If true (default), clamp transmission values and final flux to [0,1]. */
  clamp01?: boolean;
  /** Optional early-exit threshold for the transmission product. */
  earlyExitTMin?: number;
};

function safeTransmissionValue(x: number, doClamp: boolean): number {
  // Non-finite transmission should behave like "no effect" to avoid blowing up the integral.
  if (!Number.isFinite(x)) return 1;
  return doClamp ? clamp01(x) : x;
}

function hardDiskTransmission(rho: number, r0: number, doClamp: boolean): number {
  if (!Number.isFinite(rho) || rho < 0) return 1;
  if (!Number.isFinite(r0) || r0 <= 0) return 1;
  const T = rho <= r0 ? 0 : 1;
  return doClamp ? clamp01(T) : T;
}

function hasFiniteOcculterOffset(o: TransmissionOcculter | undefined): o is TransmissionOcculter {
  return Boolean(o && Number.isFinite(o.dx) && Number.isFinite(o.dy));
}

function rawOcculterTransmission(o: TransmissionOcculter, rho: number, doClamp: boolean): number {
  if (typeof o.transmission === "function") return safeTransmissionValue(o.transmission(rho), doClamp);
  return isFinitePositive(o.r0) ? hardDiskTransmission(rho, o.r0, doClamp) : 1;
}

function transmissionForOcculter(
  x: number,
  y: number,
  o: TransmissionOcculter | undefined,
  doClamp: boolean,
): number {
  if (!hasFiniteOcculterOffset(o)) return 1;
  const rho = Math.hypot(x - o.dx, y - o.dy);
  const Ti = rawOcculterTransmission(o, rho, doClamp);
  if (!Number.isFinite(Ti)) return 1;
  return doClamp ? clamp01(Ti) : Ti;
}

function shouldExitTransmissionProduct(Ttot: number, earlyExitTMin: number): boolean {
  return Ttot <= earlyExitTMin || Ttot === 0;
}

/**
 * Total transmission T_total(x,y) = PI_i T_i(rho_i).
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
    Ttot *= transmissionForOcculter(x, y, o, doClamp);
    if (shouldExitTransmissionProduct(Ttot, earlyExitTMin)) return doClamp ? 0 : Ttot;
  }

  return doClamp ? clamp01(Ttot) : Ttot;
}

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
    maxRes: MAX_TRANSIT_GRID_RES,
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
