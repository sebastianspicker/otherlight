// src/core/typesDynamics.ts

//
// Optional non-Kepler dynamics hooks/config.
//

import type { OrbitElements, OrbitElementsProvider } from "./typesOrbit";

export type RelativityParams = {
  enabled?: boolean;
  ltte?: boolean;
  grPrecession?: boolean;
  /** Apply Shapiro delay (gravitational time delay). */
  shapiro?: boolean;
  c?: number;
  planetPrecessionPerOrbit?: number;
  moonPrecessionPerOrbit?: number;
  ltteIters?: number;
  ltteTolSec?: number;
  /** Optional minimum impact parameter used to regularize Shapiro delay [sim units]. */
  shapiroMinImpact?: number;
};

export type NBodyPerturberParams = {
  enabled?: boolean;

  /** Gravitational parameter mu = G*M for the perturber (must be > 0). */
  mu?: number;

  /** Perturber orbit elements used as initial conditions (dynamically integrated afterward). */
  orbit?: OrbitElements | OrbitElementsProvider;
};

export type NBodyPlanetMoonParams = {
  enabled?: boolean;

  /** Gravitational parameter mu = G*M for the star (must be > 0). */
  muStar?: number;

  /** Gravitational parameter mu = G*M for the planet (must be > 0). */
  muPlanet?: number;

  /** Gravitational parameter mu = G*M for the moon (must be > 0). */
  muMoon?: number;

  /** Recommended maximum absolute substep dt in seconds. */
  dtMax?: number;

  /**
   * Optional Plummer softening length in sim length units.
   * Purpose: Prevents numerical singularities (forces -> infinity) during close encounters/collisions.
   *
   * Typical values:
   * - ~1-10% of the smallest body's physical radius.
   * - Setting this too large acts as a "force shield" reducing gravity at close range.
   * - Setting this too small allows huge accelerations that break integration stability.
   */
  softening?: number;

  /** If true, throw on overlapping bodies when softening == 0 (debug/strict). */
  throwOnOverlap?: boolean;

  /** Optional external perturbers (mutually coupled, full N-body integration). */
  perturbers?: NBodyPerturberParams[];
};

/** Data-driven exomoon timing/shape configuration. */
export type ExomoonTimingShapeParams = {
  enabled?: boolean;

  /** Reference epoch for evolution and for “relative to ref” diagnostics. Default: 0. */
  tRef?: number;

  /** Finite-difference time step [s] used when estimating projected sky-plane speeds. */
  velDt?: number;

  // --- Moon orbit orientation evolution (applied to moon.orbitAroundPlanet) ---
  moonOmegaDot?: number; // dΩ/dt [rad/s]
  moonIncDot?: number; // di/dt [rad/s]
  moonOmegaSmallDot?: number; // dω/dt [rad/s]

  moonOmega0?: number;
  moonInc0?: number;
  moonOmegaSmall0?: number;

  /** Optional extra drift in the moon’s sky-plane y direction [units/s] (phenomenological). */
  moonImpactYDot?: number;
};

export type SystemDynamicsParams = {
  /** Optional dynamics configuration (beyond the Kepler/barycenter model). */
  nbodyPlanetMoon?: NBodyPlanetMoonParams;
  exomoonTimingShape?: ExomoonTimingShapeParams;
  relativity?: RelativityParams;
};
