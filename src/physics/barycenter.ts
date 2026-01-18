// src/physics/barycenter.ts
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
import { vAddScaled, vIsFinite, vScale } from "./vec3";

export type BarySplit = {
  rPrimary: Vec3;
  rSecondary: Vec3;

  // Fraction applied to +rRel for secondary: mPrimary / (mP+mS)
  muPrimary: number;

  // Fraction applied to -rRel for primary: mSecondary / (mP+mS)
  muSecondary: number;
};

/** Returns true if m is a usable positive finite mass. */
export function isValidMass(m: unknown): m is number {
  return typeof m === "number" && Number.isFinite(m) && m > 0;
}

/**
 * Compute barycentric split for a two-body system.
 *
 * Inputs:
 * - rBary: barycenter absolute position
 * - rRel: relative position from primary to secondary (rSecondary - rPrimary)
 * - mPrimary, mSecondary: positive masses
 *
 * Output:
 * - absolute positions rPrimary and rSecondary, plus mass fractions.
 *
 * Throws if vectors are non-finite or masses are invalid.
 */
export function splitBarycentricPair(params: {
  rBary: Vec3;
  rRel: Vec3;
  mPrimary: number;
  mSecondary: number;
}): BarySplit {
  const { rBary, rRel, mPrimary, mSecondary } = params;

  if (!vIsFinite(rBary)) throw new Error("splitBarycentricPair: rBary must be finite.");
  if (!vIsFinite(rRel)) throw new Error("splitBarycentricPair: rRel must be finite.");
  if (!isValidMass(mPrimary)) throw new Error("splitBarycentricPair: mPrimary must be a positive finite number.");
  if (!isValidMass(mSecondary)) throw new Error("splitBarycentricPair: mSecondary must be a positive finite number.");

  const mTot = mPrimary + mSecondary;
  if (!Number.isFinite(mTot) || mTot <= 0) {
    throw new Error("splitBarycentricPair: mPrimary+mSecondary must be finite.");
  }

  // Fractions; use both explicitly for numerical clarity.
  const muSecondary = mSecondary / mTot; // multiplies rRel for primary offset (negative sign)
  const muPrimary = mPrimary / mTot; // multiplies rRel for secondary offset (positive sign)

  // rPrimary = rBary - muSecondary * rRel
  const rPrimary = vAddScaled(rBary, rRel, -muSecondary);

  // rSecondary = rBary + muPrimary * rRel
  const rSecondary = vAddScaled(rBary, rRel, muPrimary);

  // Extra guard: if numeric overflow produced non-finite vectors, fail loudly.
  if (!vIsFinite(rPrimary) || !vIsFinite(rSecondary)) {
    throw new Error("splitBarycentricPair: numerical overflow produced non-finite positions.");
  }

  return { rPrimary, rSecondary, muPrimary, muSecondary };
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
  const { rBary, rRel, mPrimary, mSecondary } = params;

  if (!vIsFinite(rBary) || !vIsFinite(rRel)) return null;
  if (!isValidMass(mPrimary) || !isValidMass(mSecondary)) return null;

  const mTot = mPrimary + mSecondary;
  if (!Number.isFinite(mTot) || mTot <= 0) return null;

  const muSecondary = mSecondary / mTot;
  const muPrimary = mPrimary / mTot;

  const rPrimary = vAddScaled(rBary, rRel, -muSecondary);
  const rSecondary = vAddScaled(rBary, rRel, muPrimary);

  if (!vIsFinite(rPrimary) || !vIsFinite(rSecondary)) return null;

  return { rPrimary, rSecondary, muPrimary, muSecondary };
}

/**
 * Convenience: compute the barycenter from absolute positions.
 *
 * rBary = (mP*rP + mS*rS) / (mP+mS)
 */
export function barycenterOfPair(params: {
  rPrimary: Vec3;
  rSecondary: Vec3;
  mPrimary: number;
  mSecondary: number;
}): Vec3 {
  const { rPrimary, rSecondary, mPrimary, mSecondary } = params;

  if (!vIsFinite(rPrimary)) throw new Error("barycenterOfPair: rPrimary must be finite.");
  if (!vIsFinite(rSecondary)) throw new Error("barycenterOfPair: rSecondary must be finite.");
  if (!isValidMass(mPrimary)) throw new Error("barycenterOfPair: mPrimary must be a positive finite number.");
  if (!isValidMass(mSecondary)) throw new Error("barycenterOfPair: mSecondary must be a positive finite number.");

  const mTot = mPrimary + mSecondary;
  if (!Number.isFinite(mTot) || mTot <= 0) throw new Error("barycenterOfPair: mPrimary+mSecondary must be finite.");

  const wP = mPrimary / mTot;
  const wS = mSecondary / mTot;

  // rBary = wP*rPrimary + wS*rSecondary
  const rBary = vAddScaled(vScale(rPrimary, wP), rSecondary, wS);

  if (!vIsFinite(rBary)) throw new Error("barycenterOfPair: numerical overflow produced non-finite barycenter.");

  return rBary;
}

/**
 * Micro-optimized consistency check (no sqrt):
 * Verifies that (rSecondary - rPrimary) ≈ rRel within a tolerance.
 */
export function isSplitConsistentWithRel(
  split: Pick<BarySplit, "rPrimary" | "rSecondary">,
  rRel: Vec3,
  tol = 1e-9,
): boolean {
  if (!vIsFinite(split.rPrimary) || !vIsFinite(split.rSecondary) || !vIsFinite(rRel)) return false;

  const t = Number.isFinite(tol) ? Math.max(0, tol) : 0;
  const tolSq = t * t;

  const dx = (split.rSecondary.x - split.rPrimary.x) - rRel.x;
  const dy = (split.rSecondary.y - split.rPrimary.y) - rRel.y;
  const dz = (split.rSecondary.z - split.rPrimary.z) - rRel.z;

  const distSq = dx * dx + dy * dy + dz * dz;
  return distSq <= tolSq;
}

/* -----------------------------
 * Minimal built-in tests
 * ----------------------------- */

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`barycenter self-test failed: ${msg}`);
}

function approxEq(a: number, b: number, eps = 1e-12): boolean {
  return Math.abs(a - b) <= eps;
}

export function runBarycenterSelfTests(): void {
  const rBary: Vec3 = { x: 0, y: 0, z: 0 };
  const rRel: Vec3 = { x: 1, y: 0, z: 0 };
  const mPrimary = 2;
  const mSecondary = 1;

  const s = splitBarycentricPair({ rBary, rRel, mPrimary, mSecondary });

  assert(approxEq(s.muSecondary, 1 / 3), "muSecondary should be 1/3 for mP=2,mS=1.");
  assert(approxEq(s.muPrimary, 2 / 3), "muPrimary should be 2/3 for mP=2,mS=1.");

  // Expected: rPrimary = (-1/3,0,0), rSecondary = (2/3,0,0)
  assert(approxEq(s.rPrimary.x, -1 / 3), "rPrimary.x mismatch.");
  assert(approxEq(s.rSecondary.x, 2 / 3), "rSecondary.x mismatch.");

  // Check rel consistency.
  assert(isSplitConsistentWithRel(s, rRel, 1e-12), "Split must be consistent with rRel.");

  // Barycenter must reconstruct.
  const rB = barycenterOfPair({ rPrimary: s.rPrimary, rSecondary: s.rSecondary, mPrimary, mSecondary });
  assert(approxEq(rB.x, 0, 1e-12) && approxEq(rB.y, 0, 1e-12) && approxEq(rB.z, 0, 1e-12), "Barycenter reconstruction failed.");

  // trySplit: invalid masses should return null (no-throw path).
  const t1 = trySplitBarycentricPair({ rBary, rRel, mPrimary: -1, mSecondary: 1 });
  assert(t1 === null, "trySplit must return null for invalid masses.");
}
