// src/sim/occulters.ts

import type { SkyPoint, SystemParams } from "../core/types";
import { isFinitePositive } from "../core/units";
import type { OcculterShape } from "../photometry/occulterEllipse";
import { buildBodyOcculters } from "./occultersBody";
import type { BodyKinematics } from "./kinematics";

export type BodyOcculterArgs = {
  rStar: number;
  sky: SkyPoint | undefined;
  rBody: number;
  shape?: { oblateness?: number; angle?: number };
  rings?: {
    innerRadius: number;
    outerRadius: number;
    inclination?: number;
    positionAngle?: number;
    opacity?: number;
  };
};

export function buildOcculters(params: SystemParams, kin: BodyKinematics): OcculterShape[] {
  const occulters: OcculterShape[] = [];

  // stepSystem() should validate radii; keep lightweight defense anyway.
  if (!isFinitePositive(params.star?.r) || !isFinitePositive(params.planet?.r)) {
    return occulters;
  }

  const rStar = params.star.r;

  occulters.push(
    ...buildBodyOcculters({
      rStar,
      sky: kin.planetSky,
      rBody: params.planet.r,
      shape: params.planet.shape,
      rings: params.planet.rings,
    }),
  );

  // Optional moon occulter.
  if (params.moon) {
    occulters.push(
      ...buildBodyOcculters({
        rStar,
        sky: kin.moonSky,
        rBody: params.moon.r,
        shape: params.moon.shape,
        rings: params.moon.rings,
      }),
    );
  }

  return occulters;
}
