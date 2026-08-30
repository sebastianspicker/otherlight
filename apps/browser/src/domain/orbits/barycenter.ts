/** Computes mass-weighted barycentres and reflex positions in a common frame. */
//
// Barycentric utilities for two-body systems (e.g. planet–moon).
//
// Scientific intent:
// - Given a barycentric position rBary (e.g. barycenter orbiting the star) and a relative vector
//   rRel pointing from primary -> secondary (i.e. rSecondary - rPrimary), compute absolute positions:
//
//   rPrimary   = rBary - (mSecondary / (mPrimary + mSecondary)) * rRel
//   rSecondary = rBary + (mPrimary   / (mPrimary + mSecondary)) * rRel
//
// - These satisfy the barycenter definition:
//   rBary = (mPrimary*rPrimary + mSecondary*rSecondary) / (mPrimary + mSecondary)
//
// Robustness / design:
// - Side-effect free.
// - Does not assume units.
// - try* helpers return null instead of throwing for UI/sim resilience.

import type { Vec3 } from "./vec3";
import { vAddScaled, vIsFinite } from "./vec3";

export type BarySplit = {
  rPrimary: Vec3;
  rSecondary: Vec3;

  // Fraction applied to +rRel for secondary: mPrimary / (mP+mS)
  muPrimary: number;

  // Fraction applied to -rRel for primary: mSecondary / (mP+mS)
  muSecondary: number;
};

type BarySplitParams = {
  rBary: Vec3;
  rRel: Vec3;
  mPrimary?: number;
  mSecondary?: number;
};

type MassFractions = Pick<BarySplit, "muPrimary" | "muSecondary">;

/** Returns true if m is a usable positive finite mass. */
function isValidMass(m: unknown): m is number {
  return typeof m === "number" && Number.isFinite(m) && m > 0;
}

function hasFiniteBaryVectors(params: BarySplitParams): boolean {
  return vIsFinite(params.rBary) && vIsFinite(params.rRel);
}

function massFractions(mPrimary: number, mSecondary: number): MassFractions | null {
  const mTot = mPrimary + mSecondary;
  if (!Number.isFinite(mTot) || mTot <= 0) return null;
  return {
    muPrimary: mPrimary / mTot,
    muSecondary: mSecondary / mTot,
  };
}

function finiteBarySplit(
  params: BarySplitParams,
  fractions: MassFractions,
): Pick<BarySplit, "rPrimary" | "rSecondary"> | null {
  const rPrimary = vAddScaled(params.rBary, params.rRel, -fractions.muSecondary);
  const rSecondary = vAddScaled(params.rBary, params.rRel, fractions.muPrimary);
  return vIsFinite(rPrimary) && vIsFinite(rSecondary) ? { rPrimary, rSecondary } : null;
}

/**
 * Non-throwing helper: returns null if inputs are invalid.
 *
 * Intended for sim code paths where masses are optional:
 * - If mPrimary/mSecondary are missing or invalid, return null and let the caller fall back to:
 *   rPrimary = rBary
 *   rSecondary = rBary + rRel
 */
export function trySplitBarycentricPair(params: {
  rBary: Vec3;
  rRel: Vec3;
  mPrimary?: number;
  mSecondary?: number;
}): BarySplit | null {
  const { mPrimary, mSecondary } = params;
  if (!hasFiniteBaryVectors(params)) return null;
  if (!isValidMass(mPrimary) || !isValidMass(mSecondary)) return null;

  const fractions = massFractions(mPrimary, mSecondary);
  if (!fractions) return null;
  const split = finiteBarySplit(params, fractions);
  return split ? { ...split, ...fractions } : null;
}
