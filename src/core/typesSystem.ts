// src/core/typesSystem.ts

//
// System/scene top-level configuration.
//

import type { OrbitElements, OrbitElementsProvider } from "./typesOrbit";
import type { Observer } from "./typesObserver";
import type { PhotometryParams } from "./typesPhotometry";
import type { SystemDynamicsParams } from "./typesDynamics";
import type { DidacticsParams } from "./typesDidactics";

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

export type BodySpinParams = {
  /** Rotation period [s]. */
  rotationPeriodSec?: number;
  /** Obliquity relative to orbital angular momentum [rad]. */
  obliquity?: number;
  /** Sky-plane position angle of the projected spin axis [rad]. */
  axisPositionAngle?: number;
};

export type BodyGravityHarmonicsParams = {
  /** Zonal quadrupole coefficient (dimensionless). */
  J2?: number;
};

export type BodyTidesParams = {
  enabled?: boolean;
  /** Degree-2 Love number. */
  k2?: number;
  /** Tidal quality factor (dimensionless). */
  Q?: number;
  /**
   * Optional explicit secular drift rates (fallback/simple mode):
   * - da/dt [m/s]
   * - de/dt [1/s]
   */
  daDt?: number;
  deDt?: number;
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

  /** Optional spin state parameters. */
  spin?: BodySpinParams;

  /** Optional gravity harmonics for secular precession models. */
  gravityHarmonics?: BodyGravityHarmonicsParams;

  /** Optional tidal parameters for secular evolution models. */
  tides?: BodyTidesParams;
};

/** Complete simulation parameters (V2 contract). */
export type SystemParamsV2 = {
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
  /** Optional didactic learning/lab settings (in-app only). */
  didactics?: DidacticsParams;
};

/**
 * Backward import name. This project now treats SystemParams as V2.
 * Legacy fields are intentionally not reintroduced.
 */
export type SystemParams = SystemParamsV2;
