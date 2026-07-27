/** Defines orbital-element contracts used across physics and simulation layers. */

//
// Orbit-related core domain types.
//

export type OrbitElements = {
  /** Semi-major axis (simulation length units). */
  a: number;

  /**
   * Eccentricity (elliptic).
   * Constraint: 0 <= e < 1.
   * Values >= 1 (parabolic/hyperbolic) are not supported by the Kepler solver.
   */
  e: number;

  /** Inclination [rad]. */
  inc: number;

  /** Longitude of ascending node / RAAN [rad]. */
  Omega: number;

  /** Argument of periapsis [rad]. */
  omega: number;

  /**
   * Orbital period [s].
   * Constraint: Must be strictly positive (> 0).
   */
  period: number;

  /** Time of periapsis passage [s]. */
  t0: number;
};

/**
 * Provider for time-dependent orbital elements.
 *
 * Intended use:
 * - Long-timescale effects (precession, tidal drift) can be represented as OrbitElements(t).
 * - sim.ts can accept either constant elements or a provider without changing the core Kepler solver.
 *
 * Serialization note:
 * - Functions are not JSON-serializable. For presets/UI, store parameters and build providers in code.
 */
export type OrbitElementsProvider = (t: number) => OrbitElements;
