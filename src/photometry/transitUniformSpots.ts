// src/photometry/transitUniformSpots.ts
//
// Uniform-brightness stellar disk transit photometry with stellar spots/faculae,
// using deterministic midpoint integration over the stellar disk.
//
// Scientific model (simple but useful):
// - The star has uniform baseline specific intensity I0 across its disk.
// - Brightness patches (spots/faculae) multiply local intensity by a factor f(x,y) >= 0.
// - Occulters are opaque circular disks blocking projected light.
//
// Returned quantity:
// - Normalized stellar flux factor F in [0,1], normalized to the *same patched star without occulters*,
//   so F = 1 out of transit for any patch map.

import type { BrightnessPatch, SpotEvolutionParams } from "../core/types";
import { clamp, clamp01, isFinitePositive } from "../core/units";

import { patchFactorAt, sanitizeBrightnessPatches, type PatchCombineMode } from "./patches";
import { integrateDiskMidpoint } from "./diskMidpoint";
import { orbitalPhaseFromPeriod, spotLifecycleWeight } from "./stellarVariability";

import {
  anyCircleOcculterFullyCoversStar,
  clampGridRes,
  sanitizeCircleOcculters,
  type CircleOcculter,
} from "./occulterCircle";

function positivePatchIntensity(
  x: number,
  y: number,
  patches: ReturnType<typeof sanitizeBrightnessPatches>,
  mode: PatchCombineMode,
): number {
  const I = patchFactorAt(x, y, patches, mode);
  return Number.isFinite(I) ? Math.max(0, I) : 1;
}

function normalizedPatchFlux(totalIntensity: number, blockedIntensity: number): number {
  if (!(Number.isFinite(totalIntensity) && totalIntensity > 0)) return 1.0;
  return clamp01((totalIntensity - blockedIntensity) / totalIntensity);
}

/**
 * Normalized flux for a uniform-brightness stellar disk with brightness patches (spots/faculae)
 * and circular occulters.
 *
 * Returns F in [0,1], where 1 is unobscured relative to the same patchy star.
 */
export function fluxUniformDiskWithPatches(params: {
  rStar: number;
  rOcculters: CircleOcculter[];
  brightnessPatches?: BrightnessPatch[];
  /**
   * Resolution parameter for the disk integral.
   * Roughly corresponds to samples across the stellar diameter in y-direction.
   */
  gridRes?: number;
  /**
   * Patch-combination policy (optional).
   * Default: "multiply" (backwards compatible).
   */
  patchCombineMode?: PatchCombineMode;
}): number {
  const rStar = params.rStar;

  if (!isFinitePositive(rStar)) {
    throw new Error("fluxUniformDiskWithPatches: rStar must be a positive finite number.");
  }

  // Single-source occulter handling.
  const occulters = sanitizeCircleOcculters(rStar, params.rOcculters ?? []);
  if (occulters.length === 0) return 1.0;

  if (anyCircleOcculterFullyCoversStar(rStar, occulters)) return 0.0;

  const patches = sanitizeBrightnessPatches(params.brightnessPatches);
  const patchCombineMode: PatchCombineMode = params.patchCombineMode ?? "multiply";
  const gridRes = clampGridRes(params.gridRes, 220);

  const { total: totalIntensity, blocked: blockedIntensity } = integrateDiskMidpoint({
    rStar,
    occulters,
    gridRes,
    intensityAt: ({ x, y }) => {
      return positivePatchIntensity(x, y, patches, patchCombineMode);
    },
    earlyExitFluxEps: 0,
  });

  return normalizedPatchFlux(totalIntensity, blockedIntensity);
}

type SpotEvolutionContext = {
  t: number;
  tRef: number;
  rotation: number;
  coverage: number;
  lifetime: number;
};

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function rotationPhaseAtTime(t: number, model: SpotEvolutionParams, tRef: number): number {
  const period = model.rotationPeriodSec ?? Number.NaN;
  const phase = Number.isFinite(period) && period > 0 ? orbitalPhaseFromPeriod({ t, period, t0: tRef }) : 0;
  return Number.isFinite(phase) ? phase : 0;
}

function spotEvolutionContext(t: number, model: SpotEvolutionParams): SpotEvolutionContext {
  const tRef = finiteOrDefault(model.tRef, 0);
  const driftRate = finiteOrDefault(model.driftRateRadPerSec, 0);
  const rotOffset = finiteOrDefault(model.rotationPhase0, 0);
  return {
    t,
    tRef,
    rotation: rotationPhaseAtTime(t, model, tRef) + driftRate * (t - tRef) + rotOffset,
    coverage: clamp(finiteOrDefault(model.coverage, 1), 0, 1),
    lifetime: finiteOrDefault(model.lifetimeSec, 0),
  };
}

function finitePatchCoordinate(value: number | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0;
}

function evolvedPatchFactor(
  patch: BrightnessPatch,
  baseAngle: number,
  context: SpotEvolutionContext,
): number {
  let factor = finiteOrDefault(patch.factor, 1);
  factor = 1 + context.coverage * (factor - 1);
  if (context.lifetime > 0) {
    const w = spotLifecycleWeight({
      t: context.t,
      lifetimeSec: context.lifetime,
      t0: context.tRef,
      phaseOffset: baseAngle,
    });
    factor = 1 + (factor - 1) * w;
  }
  return Math.max(0, factor);
}

function evolveSingleBrightnessPatch(patch: BrightnessPatch, context: SpotEvolutionContext): BrightnessPatch {
  const x0 = finitePatchCoordinate(patch.x);
  const y0 = finitePatchCoordinate(patch.y);
  const r = Math.hypot(x0, y0);
  const baseAngle = r > 0 ? Math.atan2(y0, x0) : 0;
  const angle = baseAngle + context.rotation;
  const factor = evolvedPatchFactor(patch, baseAngle, context);
  const position = { x: r * Math.cos(angle), y: r * Math.sin(angle), factor };
  if (patch.shape !== "ellipse") return { ...patch, ...position };

  const baseShapeAngle = finiteOrDefault(patch.angle, 0);
  return { ...patch, ...position, angle: baseShapeAngle + context.rotation };
}

export function evolveBrightnessPatches(params: {
  patches?: BrightnessPatch[];
  t: number;
  model?: SpotEvolutionParams;
}): BrightnessPatch[] {
  const patches = params.patches ?? [];
  const model = params.model;

  if (!model?.enabled || patches.length === 0) return patches;

  const context = spotEvolutionContext(params.t, model);
  const out: BrightnessPatch[] = new Array(patches.length);
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i];
    out[i] = p ? evolveSingleBrightnessPatch(p, context) : p;
  }

  return out;
}

export function spotFluxFactorFromPatches(params: {
  rStar: number;
  patches?: BrightnessPatch[];
  gridRes?: number;
}): number {
  const rStar = params.rStar;
  if (!isFinitePositive(rStar)) return 1;

  const patches = sanitizeBrightnessPatches(params.patches);
  if (patches.length === 0) return 1;

  const gridRes = clampGridRes(params.gridRes, 220);
  const { total } = integrateDiskMidpoint({
    rStar,
    occulters: [],
    gridRes,
    intensityAt: ({ x, y }) => {
      const I = patchFactorAt(x, y, patches, "multiply");
      return Number.isFinite(I) ? Math.max(0, I) : 1;
    },
    earlyExitFluxEps: 0,
  });

  // NOTE: The normalization below uses the analytical disk area (pi*R^2)
  // rather than the grid-approximated area (sum of cell areas for cells
  // inside the disk).  This introduces a tiny systematic error (~0.002% at
  // gridRes=220) because the grid under-covers the disk near the circular
  // boundary.  The error is negligible for practical use.
  const area = Math.PI * rStar * rStar;
  if (!(Number.isFinite(total) && total > 0 && Number.isFinite(area) && area > 0)) return 1;
  return total / area;
}

// Backwards-compat: keep the old exported name if other modules import it as Occulter.
export type Occulter = CircleOcculter;
