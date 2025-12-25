// src/physics/barycenter.ts
//
// Barycentric utilities for two-body systems (e.g. planet–moon).
//
// Explicit role definitions (used by sim.ts)
// -----------------------------------------
// In this repo’s simulation, when splitting a planet–moon pair:
//
// - primary   = planet
// - secondary = moon
//
// The relative vector MUST be defined as:
//   rRel = rSecondary - rPrimary
// i.e. "primary -> secondary" (planet -> moon).
//
// This matches sim.ts usage where rRel is computed from the moon orbit-around-planet elements
// (a Keplerian relative orbit), and then trySplitBarycentricPair(...) is called to obtain:
// - rPrimary   (planet absolute position)
// - rSecondary (moon absolute position)
//
// Core equations
// --------------
// Given barycenter position rBary (absolute), masses mP, mS, and rRel = rS - rP:
//
//   rP = rBary - (mS / (mP + mS)) * rRel
//   rS = rBary + (mP / (mP + mS)) * rRel
//
// These satisfy the barycenter identity:
//   rBary = (mP*rP + mS*rS) / (mP + mS)
//
// Robustness / design
// -------------------
// - Side-effect free.
// - No unit assumptions (simulation units).
// - "try" helper returns null (no throw) when masses are missing/invalid so sim.ts can fall back
//   to non-barycentric behavior.
//
// Optional self-test helpers are included but not run automatically.

import type { Vec3 } from "./vec3";
import { vAddScaled, vIsFinite, vScale, vSub, vDist } from "./vec3";

export type BarySplit = {
  /** Absolute position of primary (planet). */
  rPrimary: Vec3;

  /** Absolute position of secondary (moon). */
  rSecondary: Vec3;

  /** Fraction applied to +rRel to obtain the secondary offset from rBary: mPrimary/(mP+mS). */
  muPrimary: number;

  /** Fraction applied to -rRel to obtain the primary offset from rBary: mSecondary/(mP+mS). */
  muSecondary: number;
};

/**
 * Returns true if m is a usable positive finite mass.
 */
export function isValidMass(m: unknown): m is number {
  return typeof m === "number" && Number.isFinite(m) && m > 0;
}

/**
 * Compute barycentric split for a two-body system.
 *
 * Definitions:
 * - primary   = planet
 * - secondary = moon
 * - rRel      = rSecondary - rPrimary (planet -> moon)
 *
 * Inputs:
 * - rBary: barycenter absolute position (e.g. orbit about star)
 * - rRel: relative position from primary to secondary (rSecondary - rPrimary)
 * - mPrimary, mSecondary: positive masses
 *
 * Output:
 * - absolute positions rPrimary and rSecondary, plus mass fractions.
 *
 * Throws:
 * - if vectors are non-finite or masses are invalid.
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
    throw new Error("splitBarycentricPair: mPrimary+mSecondary must be finite and > 0.");
  }

  // Fractions (explicit for clarity).
  // muSecondary is applied with a negative sign for rPrimary.
  const muSecondary = mSecondary / mTot; // in (0,1)
  const muPrimary = mPrimary / mTot; // in (0,1)

  // rPrimary   = rBary - muSecondary * rRel
  const rPrimary = vAddScaled(rBary, rRel, -muSecondary);

  // rSecondary = rBary + muPrimary * rRel
  const rSecondary = vAddScaled(rBary, rRel, muPrimary);

  if (!vIsFinite(rPrimary) || !vIsFinite(rSecondary)) {
    throw new Error("splitBarycentricPair: numerical overflow produced non-finite positions.");
  }

  return { rPrimary, rSecondary, muPrimary, muSecondary };
}

/**
 * Non-throwing helper: returns null if inputs are invalid.
 *
 * Intended for sim.ts where masses are optional:
 * - If mPrimary/mSecondary are missing or invalid, return null and let caller fall back to:
 *     rPrimary   = rBary
 *     rSecondary = rBary + rRel
 *
 * Definitions (same as splitBarycentricPair):
 * - primary   = planet
 * - secondary = moon
 * - rRel      = rSecondary - rPrimary (planet -> moon)
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
 * Useful for sanity checks / tests.
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
 * Internal consistency check: verify rRel = rSecondary - rPrimary.
 * Returns true if consistent to within eps; false otherwise.
 */
export function isSplitConsistentWithRel(split: BarySplit, rRel: Vec3, eps = 1e-10): boolean {
  if (!Number.isFinite(eps) || eps < 0) throw new Error("isSplitConsistentWithRel: eps must be finite and >= 0.");
  const relRecon = vSub(split.rSecondary, split.rPrimary);
  return vDist(relRecon, rRel) <= eps;
}

/**
 * Optional self-test helper (does not run automatically).
 *
 * Test requested:
 *   barycenterOfPair(splitBarycentricPair(...)) ≈ rBary
 */
export function _barycenterSelfTest(): void {
  const rBary: Vec3 = { x: 10, y: -3, z: 2 };
  const rRel: Vec3 = { x: 4, y: 1, z: -2 }; // primary->secondary
  const mP = 5;
  const mS = 2;

  const split = splitBarycentricPair({ rBary, rRel, mPrimary: mP, mSecondary: mS });
  const rBary2 = barycenterOfPair({ rPrimary: split.rPrimary, rSecondary: split.rSecondary, mPrimary: mP, mSecondary: mS });

  if (vDist(rBary2, rBary) > 1e-10) {
    throw new Error("_barycenterSelfTest: barycenter reconstruction failed.");
  }

  if (!isSplitConsistentWithRel(split, rRel, 1e-10)) {
    throw new Error("_barycenterSelfTest: rRel sign/definition mismatch.");
  }
}
