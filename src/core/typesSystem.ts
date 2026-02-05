// src/core/typesSystem.ts

//
// System/scene top-level configuration.
//

import type { OrbitElements, OrbitElementsProvider } from "./typesOrbit";
import type { Observer } from "./typesObserver";
import type { PhotometryParams } from "./typesPhotometry";
import type { SystemDynamicsParams } from "./typesDynamics";

export type BodyShapeParams = {
  /**
   * Oblateness / flattening f = (Re - Rp) / Re in [0,1).
   * Interprets body.r as the equatorial radius Re.
   */
  oblateness?: number;

  /** Optional sky-plane orientation of the oblate axis [rad]. */
  angle?: number;
};

export type RingSystemParams = {
  /** Inner ring radius [m]. */
  innerRadius: number;
  /** Outer ring radius [m]. */
  outerRadius: number;
  /** Ring tilt away from face-on [rad]. */
  inclination?: number;
  /** Ring major-axis position angle in the sky plane [rad]. */
  positionAngle?: number;
};

export type Body = {
  /** Radius [m]. */
  r: number;

  /**
   * Optional mass.
   *
   * Not required for purely kinematic Kepler orbits, but useful for:
   * - Hill-sphere checks
   * - barycentric planet-moon motion (TTV/TDV in stepSystem)
   * - tides / stability heuristics
   *
   * Units:
   * - Kilograms (SI). Ratios are used in barycenter splits, but SI is required for N-body mode.
   */
  m?: number;

  /** Optional shape parameters (e.g. oblateness). */
  shape?: BodyShapeParams;

  /** Optional ring system parameters. */
  rings?: RingSystemParams;
};

/** Complete simulation parameters. */
export type SystemParams = {
  observer?: Observer;

  star: Body & {
    photometry?: PhotometryParams;
  };

  /** Planet is always present. */
  planet: Body & {
    orbit: OrbitElements | OrbitElementsProvider;
  };

  moon?: Body & {
    orbitAroundPlanet: OrbitElements | OrbitElementsProvider;
    /** Optional: whether the moon orbit is prograde/retrograde relative to the planet orbit. */
    sense?: "prograde" | "retrograde";
  };

  dynamics?: SystemDynamicsParams;
};
