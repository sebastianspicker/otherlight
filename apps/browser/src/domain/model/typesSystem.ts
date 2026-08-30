/** Defines the canonical star, planet, moon, and binary system parameter contracts. */

//
// System/scene top-level configuration.
//

import type { OrbitElements, OrbitElementsProvider } from "./typesOrbit";
import type { Observer } from "./typesObserver";
import type { PhotometryParams } from "./typesPhotometry";
import type { SystemDynamicsParams } from "./typesDynamics";
import type { DidacticsParams } from "./typesDidactics";
import type { PassbandId, StellarLimbDarkeningParams } from "./typesLimbDarkening";

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
  /** Ring opacity in [0,1]. 0 = fully transparent, 1 = fully opaque (default). */
  opacity?: number;
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
   * - barycentric planet-moon motion (TTV/TDV in the simulation step)
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

export type BinaryStarPhotometryParams = StellarLimbDarkeningParams & {
  /** Compatibility brightness override used until per-star bandpass flux is fully physical. */
  luminosityScale?: number;
  /** Optional preferred passband for per-star photometry lookups. */
  passband?: PassbandId;
};

export type BinarySystemPhotometryParams = {
  primary?: BinaryStarPhotometryParams;
  secondary?: BinaryStarPhotometryParams;
};

/**
 * Mutable Browser form state.
 *
 * This is intentionally a draft/view model, not a simulation or serialized
 * scenario contract. Application code validates and maps it to
 * EducationScenarioV4 before runtime, persistence, or science use.
 */
export type BrowserScenarioDraft = {
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
  /**
   * Optional detached-binary per-star photometry metadata.
   *
   * This bridge keeps star-specific stellar parameters available while the
   * Browser editor represents detached binaries with its star-plus-planet form.
   */
  binaryStars?: BinarySystemPhotometryParams;
  /** Optional didactic learning/lab settings (in-app only). */
  didactics?: DidacticsParams;
};

/**
 * Legacy V2 import/file-format shape. It is accepted only at compatibility
 * boundaries and must not be used for live Browser authoring or runtime state.
 */
export type SystemParamsV2 = BrowserScenarioDraft;
