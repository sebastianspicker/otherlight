/** Defines observer geometry and viewing-frame configuration contracts. */

//
// Observer & sky-projection related types.
//

import type { Vec3 } from "../physics/vec3";

export type Observer = {
  /**
   * Line-of-sight direction in inertial coordinates.
   *
   * Convention: points from the star toward the observer.
   *
   * Notes:
   * - It need not be unit length; physics/frames utilities normalize as needed.
   * - For a UI "camera position" c=(x,y,z) in the same inertial coordinates, a common mapping is:
   *     dir = normalize(c)   (observer located at +c looking toward the origin)
   *     or dir = normalize(-c) depending on your sign convention.
   */
  dir: Vec3;

  /**
   * Optional UI helper: camera/observer position vector (in inertial coordinates).
   * This is NOT used directly by the physics unless your UI/controller maps it into `dir`.
   */
  pos?: Vec3;

  /**
   * Optional UI helper: if true, interpret `pos` as the primary control and derive `dir` from it.
   * This is a UI/controller flag; core physics may ignore it.
   */
  deriveDirFromPos?: boolean;

  /**
   * Optional observer timekeeping model for didactic timing demos.
   * This is intentionally separate from system dynamics: it shifts the reported
   * observation timestamps without changing the physical orbit solution.
   */
  timekeeping?: {
    enabled?: boolean;
    /** Constant barycentric/clock offset applied to reported event times [s]. */
    barycentricOffsetSec?: number;
    /** Optional periodic timing error amplitude [s]. */
    periodicErrorAmpSec?: number;
    /** Period of the periodic timing error [s]. */
    periodSec?: number;
    /** Phase origin of the periodic timing error [s]. */
    phaseSec?: number;
  };
};

export type SkyPoint = { x: number; y: number; z: number };
