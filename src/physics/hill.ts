// src/physics/hill.ts

export type HillRadiusOptions = {
  /**
   * If true, use the periapsis distance r_p = a(1-e), which gives the minimum Hill radius
   * along an eccentric orbit (conservative for stability checks).
   * If false, use r = a (i.e., circular-orbit approximation / mean distance).
   */
  usePeriapsis?: boolean;
};

function assertFinitePositive(x: number, name: string) {
  if (!Number.isFinite(x) || x <= 0) throw new Error(`${name} must be a positive finite number.`);
}

function assertEccentricity(e: number, name: string) {
  if (!Number.isFinite(e) || e < 0 || e >= 1) throw new Error(`${name} must be in [0, 1).`);
}

/**
 * Hill radius at a given instantaneous separation r between primary and secondary:
 *   R_H(r) ≈ r * cbrt( m2 / (3 (m1 + m2)) )
 */
export function hillRadiusAtDistance(r: number, mSecondary: number, mPrimary: number): number {
  assertFinitePositive(r, "r");
  assertFinitePositive(mSecondary, "mSecondary");
  assertFinitePositive(mPrimary, "mPrimary");

  return r * Math.cbrt(mSecondary / (3 * (mPrimary + mSecondary)));
}

/**
 * Hill radius approximation for a secondary body (planet) orbiting a primary (star).
 *
 * For eccentric orbits, the Hill radius varies along the orbit; for stability checks it is common
 * to use the periapsis distance (minimum Hill radius): r_p = a(1-e).
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
  return hillRadiusAtDistance(r, mPlanet, mStar);
}

/**
 * Simple rule-of-thumb for maximum stable prograde satellite semi-major axis.
 * Kept as a separate helper because the exact stability boundary depends on e, inclination,
 * perturbations, tides, etc.
 */
export function maxStableProgradeMoonAxisRuleOfThumb(hillR: number, fraction = 0.5): number {
  assertFinitePositive(hillR, "hillR");
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1) {
    throw new Error("fraction must be in (0, 1).");
  }
  return hillR * fraction;
}

/**
 * Prograde stability limit following a commonly used empirical fit form (Domingos et al. style):
 *   a_crit ≈ 0.4895 * (1 - 1.0305 e_p - 0.2738 e_s) * R_H
 *
 * This is a heuristic fit; clamp to [0, R_H] to keep outputs sane for interactive use.
 */
export function maxStableProgradeMoonAxisDomingos(
  hillR: number,
  ePlanet = 0,
  eSat = 0
): number {
  assertFinitePositive(hillR, "hillR");
  assertEccentricity(ePlanet, "ePlanet");
  assertEccentricity(eSat, "eSat");

  const factor = 0.4895 * (1 - 1.0305 * ePlanet - 0.2738 * eSat);
  const aCrit = hillR * factor;

  if (!Number.isFinite(aCrit)) return 0;
  return Math.max(0, Math.min(hillR, aCrit));
}

/**
 * Retrograde satellites can remain stable farther out than prograde ones.
 * This function provides a conservative, simple limit.
 */
export function maxStableRetrogradeMoonAxisRuleOfThumb(hillR: number, fraction = 0.67): number {
  assertFinitePositive(hillR, "hillR");
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1) {
    throw new Error("fraction must be in (0, 1).");
  }
  return hillR * fraction;
}

/**
 * Utility: mutual Hill radius for two bodies orbiting the same primary (useful later for
 * planet-planet spacing / stability discussions).
 *
 * R_H,mut ≈ ((a1 + a2)/2) * cbrt( (m1 + m2) / (3 M_primary) )
 */
export function mutualHillRadius(
  a1: number,
  a2: number,
  m1: number,
  m2: number,
  mPrimary: number
): number {
  assertFinitePositive(a1, "a1");
  assertFinitePositive(a2, "a2");
  assertFinitePositive(m1, "m1");
  assertFinitePositive(m2, "m2");
  assertFinitePositive(mPrimary, "mPrimary");

  const aMean = 0.5 * (a1 + a2);
  return aMean * Math.cbrt((m1 + m2) / (3 * mPrimary));
}
