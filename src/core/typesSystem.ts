// src/core/typesSystem.ts

//
// System/scene top-level configuration.
//

import type { OrbitElements, OrbitElementsProvider } from "./typesOrbit";
import type { Observer } from "./typesObserver";
import type { PhotometryParams } from "./typesPhotometry";
import type { SystemDynamicsParams } from "./typesDynamics";

export type Body = {
  /** Radius (simulation length units). */
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
   * - Arbitrary, but must be self-consistent across bodies (only ratios matter for barycenter).
   */
  m?: number;
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
