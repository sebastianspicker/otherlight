// src/core/types.ts
//
// Core domain types for the simulation.
// Conventions used throughout:
// - Lengths are in arbitrary "simulation units" (internally consistent).
// - Time is seconds.
// - Angles are radians.
// - Photometric flux is normalized such that baseline is typically 1.0.

import type { Vec3 } from "../physics/vec3";

/**
 * Classical orbital elements (elliptic, e in [0,1)).
 * Note: Some angles become undefined for special cases (e.g., omega undefined when e=0),
 * but we keep them as numbers for simplicity and handle edge cases in physics code.
 */
export type OrbitElements = {
  a: number;       // semi-major axis (sim length units)
  e: number;       // eccentricity [0,1)
  inc: number;     // inclination [rad]
  Omega: number;   // longitude / RAAN of ascending node [rad]
  omega: number;   // argument of periapsis [rad]
  period: number;  // orbital period [s]
  t0: number;      // time of periapsis passage [s]
};

export type Body = {
  r: number;       // radius (sim length units)
  /**
   * Optional mass. Not required for purely kinematic Kepler orbits,
   * but needed for Hill-sphere checks and barycentric planet-moon motion.
   */
  m?: number;
};

/**
 * Quadratic limb darkening coefficients (optional for later models).
 * I(mu)/I(1) = 1 - u1(1-mu) - u2(1-mu)^2
 */
export type LimbDarkeningQuadratic = {
  u1: number;
  u2: number;
};

export type PhotometryParams = {
  /**
   * Baseline normalization for model flux. If omitted, code should assume 1.0.
   * (Kept here so future photometry models can support other conventions.)
   */
  baselineFlux?: number;

  /**
   * Optional limb darkening model parameters (future).
   */
  limbDarkening?: LimbDarkeningQuadratic;

  /**
   * Optional numerical resolution knobs for photometry integrators (future).
   * For the current uniform-disk integrator, this can map to gridRes.
   */
  gridRes?: number;
};

export type Observer = {
  /**
   * Line-of-sight direction in inertial coordinates.
   * Convention: points from the star toward the observer.
   * Does not need to be normalized at the type level; normalization is enforced in sim/physics code.
   */
  dir: Vec3;
};

export type SystemParams = {
  observer?: Observer;

  star: Body & {
    photometry?: PhotometryParams;
  };

  planet: Body & {
    orbit: OrbitElements;
  };

  moon?: Body & {
    orbitAroundPlanet: OrbitElements;
    /**
     * Optional: whether the moon orbit is prograde/retrograde relative to the planet orbit
     * (useful for stability constraints later).
     */
    sense?: "prograde" | "retrograde";
  };
};

export type SkyPoint = { x: number; y: number; z: number };

export type StepResult = {
  /**
   * Normalized model flux. For current transit models: 1.0 = unobscured baseline.
   */
  flux: number;

  planetSky: SkyPoint;
  moonSky?: SkyPoint;

  /**
   * Optional: convenience diagnostic values (future use; not required by renderers).
   */
  meta?: {
    t: number; // seconds
    nOcculters?: number;
  };
};
