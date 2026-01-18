// src/photometry/transitShapes.ts
//
// Generic transit integrators for mixed-shape occulters (ellipses, rings).
// These are numeric midpoint integrations and are used as a fallback when
// non-circular silhouettes are present.

import type { BrightnessPatch } from "../core/types";
import { clamp01, isFinitePositive } from "../core/units";

import type { LimbDarkeningConstraints, LimbDarkeningLaw } from "./limbDarkening";
import { intensityNonNegative, validateLimbDarkeningLaw } from "./limbDarkening";
import { patchFactorAt, sanitizeBrightnessPatches, type PatchCombineMode } from "./patches";
import { clampGridRes } from "./occulterCircle";
import { type OcculterShape, sanitizeOcculterShapes } from "./occulterEllipse";
import { integrateDiskMidpointShapes } from "./diskMidpoint";

export function fluxUniformDiskShapes(params: {
  rStar: number;
  occulters?: readonly OcculterShape[];
  gridRes?: number;
}): number {
  const rStar = params.rStar;
  if (!isFinitePositive(rStar)) {
    throw new Error("fluxUniformDiskShapes: rStar must be a positive finite number.");
  }

  const occulters = sanitizeOcculterShapes(rStar, params.occulters ?? []);
  if (occulters.length === 0) return 1.0;

  const starArea = Math.PI * rStar * rStar;
  const gridRes = clampGridRes(params.gridRes, 220);

  const blockedArea = integrateDiskMidpointShapes({
    rStar,
    occulters,
    gridRes,
    intensityAt: () => 1,
  }).blocked;

  return clamp01(1.0 - blockedArea / starArea);
}

export function fluxUniformDiskWithPatchesShapes(params: {
  rStar: number;
  occulters: OcculterShape[];
  brightnessPatches?: BrightnessPatch[];
  gridRes?: number;
  patchCombineMode?: PatchCombineMode;
}): number {
  const rStar = params.rStar;
  if (!isFinitePositive(rStar)) {
    throw new Error("fluxUniformDiskWithPatchesShapes: rStar must be a positive finite number.");
  }

  const occulters = sanitizeOcculterShapes(rStar, params.occulters ?? []);
  if (occulters.length === 0) return 1.0;

  const patches = sanitizeBrightnessPatches(params.brightnessPatches);
  const patchCombineMode: PatchCombineMode = params.patchCombineMode ?? "multiply";
  const gridRes = clampGridRes(params.gridRes, 220);

  const { total, blocked } = integrateDiskMidpointShapes({
    rStar,
    occulters,
    gridRes,
    intensityAt: ({ x, y }) => {
      const I = patchFactorAt(x, y, patches, patchCombineMode);
      return Number.isFinite(I) ? Math.max(0, I) : 1;
    },
  });

  if (!(Number.isFinite(total) && total > 0)) return 1.0;
  return clamp01(1 - blocked / total);
}

export function fluxLimbDarkenedDiskShapes(params: {
  rStar: number;
  occulters: OcculterShape[];
  limbDarkeningLaw: LimbDarkeningLaw;
  brightnessPatches?: BrightnessPatch[];
  gridRes?: number;
  constraints?: LimbDarkeningConstraints;
  patchCombineMode?: PatchCombineMode;
  earlyExitFluxEps?: number;
}): number {
  const rStar = params.rStar;
  if (!isFinitePositive(rStar)) {
    throw new Error("fluxLimbDarkenedDiskShapes: rStar must be a positive finite number.");
  }
  if (!params.limbDarkeningLaw) {
    throw new Error("fluxLimbDarkenedDiskShapes: limbDarkeningLaw must be provided.");
  }

  validateLimbDarkeningLaw(params.limbDarkeningLaw, params.constraints);

  const occulters = sanitizeOcculterShapes(rStar, params.occulters ?? []);
  if (occulters.length === 0) return 1.0;

  const patches = sanitizeBrightnessPatches(params.brightnessPatches);
  const patchCombineMode: PatchCombineMode = params.patchCombineMode ?? "multiply";
  const gridRes = clampGridRes(params.gridRes, 60);

  const { total, blocked } = integrateDiskMidpointShapes({
    rStar,
    occulters,
    gridRes,
    intensityAt: ({ x, y, mu }) => {
      const Ild = intensityNonNegative(mu, params.limbDarkeningLaw);
      if (Ild === 0) return 0;
      const Praw = patchFactorAt(x, y, patches, patchCombineMode);
      const P = Number.isFinite(Praw) ? Math.max(0, Praw) : 1;
      const I = Ild * P;
      return Number.isFinite(I) ? I : 0;
    },
    earlyExitFluxEps: params.earlyExitFluxEps ?? 0,
  });

  if (!(Number.isFinite(total) && total > 0)) return 1.0;
  return clamp01(1 - blocked / total);
}
