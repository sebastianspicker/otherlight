import { clamp } from "../core/units";
import type { HillRadiusOptions } from "./hill";

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
  opts: HillRadiusOptions = {},
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

  // When factor < 0 (high combined eccentricities), no stable prograde orbit
  // is possible at this eccentricity combination; aCrit will clamp to 0.
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
