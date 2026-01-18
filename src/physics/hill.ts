// src/physics/hill.ts
//
// Hill radius + simple satellite-stability heuristics.
//
// Scientific correctness & assumptions
// -----------------------------------
// The classical Hill radius for a secondary body of mass m orbiting a primary of mass M at
// instantaneous separation r is (circular restricted 3-body approximation):
//
//   R_H(r) ≈ r * ( m / (3 (M + m)) )^(1/3)
//
// Common simplification when m << M:
//   R_H(r) ≈ r * ( m / (3 M) )^(1/3)
//
// This module provides *validation warnings* only; it does not enforce constraints.

import type { SystemParams } from "../core/types";
import { clamp } from "../core/units";

export type HillRadiusOptions = {
  /**
   * If true, use periapsis distance r_p = a(1-e), giving a conservative minimum Hill radius
   * along an eccentric orbit (recommended for stability warnings).
   * If false, use r = a (circular/mean-distance approximation).
   */
  usePeriapsis?: boolean;
};

function assertFinitePositive(x: number, name: string): void {
  if (!Number.isFinite(x) || x <= 0) throw new Error(`${name} must be a positive finite number.`);
}

function assertEccentricity(e: number, name: string): void {
  if (!Number.isFinite(e) || e < 0 || e >= 1) throw new Error(`${name} must be in [0, 1).`);
}

/**
 * Hill radius at instantaneous separation r between primary and secondary:
 *   R_H(r) ≈ r * cbrt( mSecondary / (3 (mPrimary + mSecondary)) )
 */
export function hillRadiusAtDistance(r: number, mSecondary: number, mPrimary: number): number {
  assertFinitePositive(r, "r");
  assertFinitePositive(mSecondary, "mSecondary");
  assertFinitePositive(mPrimary, "mPrimary");

  // Use (mPrimary + mSecondary) to remain valid when mSecondary is not negligible.
  return r * Math.cbrt(mSecondary / (3 * (mPrimary + mSecondary)));
}

/**
 * Hill radius approximation for a planet (secondary) orbiting a star (primary).
 *
 * For eccentric orbits, Hill radius varies; for stability checks it is common to use
 * the periapsis distance (minimum Hill radius): r_p = a (1 - e).
 */
export function hillRadius(
  aPlanet: number,
  ePlanet: number,
  mPlanet: number,
  mStar: number,
  opts: HillRadiusOptions = {}
): number {
  assertFinitePositive(aPlanet, "aPlanet");
  assertEccentricity(ePlanet, "ePlanet");
  assertFinitePositive(mPlanet, "mPlanet");
  assertFinitePositive(mStar, "mStar");

  const usePeriapsis = opts.usePeriapsis ?? true;
  const r = usePeriapsis ? aPlanet * (1 - ePlanet) : aPlanet;

  // Here: primary=star, secondary=planet.
  return hillRadiusAtDistance(r, mPlanet, mStar);
}

/**
 * Simple rule-of-thumb for maximum stable prograde satellite semi-major axis:
 *   a_moon,max ≈ fraction * R_H
 */
export function maxStableProgradeMoonAxisRuleOfThumb(hillR: number, fraction = 0.5): number {
  assertFinitePositive(hillR, "hillR");
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1) {
    throw new Error("fraction must be in (0, 1).");
  }
  return hillR * fraction;
}

/**
 * Prograde stability limit using a common empirical fit form (Domingos et al.-style heuristic):
 *   a_crit ≈ 0.4895 * (1 - 1.0305 e_p - 0.2738 e_s) * R_H
 *
 * Output is clamped to [0, R_H] for robustness.
 */
export function maxStableProgradeMoonAxisDomingos(hillR: number, ePlanet = 0, eSat = 0): number {
  assertFinitePositive(hillR, "hillR");
  assertEccentricity(ePlanet, "ePlanet");
  assertEccentricity(eSat, "eSat");

  const factor = 0.4895 * (1 - 1.0305 * ePlanet - 0.2738 * eSat);
  const aCrit = hillR * factor;

  if (!Number.isFinite(aCrit)) return 0;
  return clamp(aCrit, 0, hillR);
}

/**
 * Retrograde satellites can remain stable farther out than prograde.
 * A conservative rule-of-thumb is ~0.67 R_H for retrograde.
 */
export function maxStableRetrogradeMoonAxisRuleOfThumb(hillR: number, fraction = 0.67): number {
  assertFinitePositive(hillR, "hillR");
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1) {
    throw new Error("fraction must be in (0, 1).");
  }
  return hillR * fraction;
}

/**
 * Mutual Hill radius for two bodies orbiting the same primary:
 *   R_H,mut ≈ ((a1 + a2)/2) * cbrt( (m1 + m2) / (3 M_primary) )
 */
export function mutualHillRadius(a1: number, a2: number, m1: number, m2: number, mPrimary: number): number {
  assertFinitePositive(a1, "a1");
  assertFinitePositive(a2, "a2");
  assertFinitePositive(m1, "m1");
  assertFinitePositive(m2, "m2");
  assertFinitePositive(mPrimary, "mPrimary");

  const aMean = 0.5 * (a1 + a2);
  return aMean * Math.cbrt((m1 + m2) / (3 * mPrimary));
}

/** Validation warning severity. */
export type PhysicsValidationSeverity = "info" | "warn";

/** A structured warning that UI code can display. */
export type PhysicsValidationMessage = {
  severity: PhysicsValidationSeverity;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

/**
 * Validate a SystemParams object for simple physics plausibility checks.
 * Returns warnings suitable for UI display (never throws).
 */
export function validateSystemParamsPhysics(p: SystemParams): PhysicsValidationMessage[] {
  const out: PhysicsValidationMessage[] = [];

  if (!p?.planet?.orbit || !p?.planet) return out;
  if (!p.moon) return out; // only meaningful if there is a moon configured

  const aP = p.planet.orbit.a;
  const eP = p.planet.orbit.e;
  const aM = p.moon.orbitAroundPlanet?.a;
  const eM = p.moon.orbitAroundPlanet?.e ?? 0;

  const mStar = p.star?.m;
  const mPlanet = p.planet?.m;
  const mMoon = p.moon?.m;

  // Basic numeric sanity (non-throwing).
  if (!Number.isFinite(aP) || aP <= 0 || !Number.isFinite(eP) || eP < 0 || eP >= 1) {
    out.push({
      severity: "warn",
      code: "PLANET_ORBIT_INVALID",
      message: "Planet orbit parameters are invalid; Hill-radius checks were skipped.",
    });
    return out;
  }

  if (!Number.isFinite(aM) || aM <= 0 || !Number.isFinite(eM) || eM < 0 || eM >= 1) {
    out.push({
      severity: "warn",
      code: "MOON_ORBIT_INVALID",
      message: "Moon orbit parameters are invalid; Hill-radius checks were skipped.",
    });
    return out;
  }

  if (!(typeof mStar === "number" && Number.isFinite(mStar) && mStar > 0)) {
    out.push({
      severity: "info",
      code: "HILL_NO_STAR_MASS",
      message: "Star mass is not set; Hill-radius stability warnings cannot be computed.",
    });
    return out;
  }

  if (!(typeof mPlanet === "number" && Number.isFinite(mPlanet) && mPlanet > 0)) {
    out.push({
      severity: "info",
      code: "HILL_NO_PLANET_MASS",
      message: "Planet mass is not set; Hill-radius stability warnings cannot be computed.",
    });
    return out;
  }

  if (!(typeof mMoon === "number" && Number.isFinite(mMoon) && mMoon > 0)) {
    out.push({
      severity: "info",
      code: "HILL_NO_MOON_MASS",
      message: "Moon mass is not set; Hill-radius stability warnings cannot be computed.",
    });
    return out;
  }

  // Compute conservative Hill radius at periapsis for the planet around the star.
  let RH: number;
  try {
    RH = hillRadius(aP, eP, mPlanet, mStar, { usePeriapsis: true });
  } catch {
    out.push({
      severity: "warn",
      code: "HILL_COMPUTE_FAILED",
      message: "Hill-radius computation failed; stability warnings were skipped.",
    });
    return out;
  }

  // Compare moon orbit semi-major axis against a conservative prograde limit.
  const aMaxPrograde = maxStableProgradeMoonAxisDomingos(RH, eP, eM);
  const fracOfHill = aM / RH;

  if (Number.isFinite(aMaxPrograde) && aM > aMaxPrograde) {
    out.push({
      severity: "warn",
      code: "MOON_BEYOND_HILL_STABILITY",
      message:
        "Moon semi-major axis exceeds a conservative prograde stability limit (Hill-sphere heuristic). The configuration may be dynamically unstable.",
      details: {
        aMoon: aM,
        eMoon: eM,
        hillR_periapsis: RH,
        aCrit_prograde: aMaxPrograde,
        aMoon_over_RH: fracOfHill,
      },
    });
  } else {
    out.push({
      severity: "info",
      code: "MOON_HILL_OK",
      message: "Moon orbit is within a conservative Hill-sphere prograde stability heuristic.",
      details: {
        aMoon: aM,
        hillR_periapsis: RH,
        aCrit_prograde: aMaxPrograde,
        aMoon_over_RH: fracOfHill,
      },
    });
  }

  // Extra informational assumption check: mPlanet << mStar.
  const massRatio = mPlanet / mStar;
  if (Number.isFinite(massRatio) && massRatio > 0.05) {
    out.push({
      severity: "info",
      code: "HILL_MASS_RATIO_LARGE",
      message:
        "Planet-to-star mass ratio is relatively large; the simple Hill-radius approximation may be less accurate (it assumes a hierarchical system).",
      details: { mPlanet_over_mStar: massRatio },
    });
  }

  return out;
}
