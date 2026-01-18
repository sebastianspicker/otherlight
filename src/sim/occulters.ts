// src/physics/occulters.ts

import type { SystemParams } from "../core/types";
import type { CircleOcculter } from "../photometry/occulterCircle";
import type { BodyKinematics } from "./kinematics";

function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

export function couldOverlapStarOnSky(
  dx: number,
  dy: number,
  rOcc: number,
  rStar: number
): boolean {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  if (!isFinitePositive(rOcc) || !isFinitePositive(rStar)) return false;

  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d)) return false;

  // Tangency is measure-zero: exclude d == rStar + rOcc.
  return d < rStar + rOcc;
}

export function buildOcculters(
  params: SystemParams,
  kin: BodyKinematics
): CircleOcculter[] {
  const occulters: CircleOcculter[] = [];

  // stepSystem() should validate radii; keep lightweight defense anyway.
  if (
    !isFinitePositive(params.star?.r) ||
    !isFinitePositive(params.planet?.r)
  ) {
    return occulters;
  }

  const rStar = params.star.r;

  // Planet as an occulter only if it is in front of the star along the line of sight.
  const planetInFront = kin.planetSky.z > 0;

  if (
    planetInFront &&
    couldOverlapStarOnSky(
      kin.planetSky.x,
      kin.planetSky.y,
      params.planet.r,
      rStar
    )
  ) {
    occulters.push({
      dx: kin.planetSky.x,
      dy: kin.planetSky.y,
      r: params.planet.r,
    });
  }

  // Optional moon occulter.
  if (params.moon && kin.moonSky && isFinitePositive(params.moon.r)) {
    const moonInFront = kin.moonSky.z > 0;

    if (
      moonInFront &&
      couldOverlapStarOnSky(
      kin.moonSky.x,
      kin.moonSky.y,
      params.moon.r,
      rStar
    )
  ) {
      occulters.push({
        dx: kin.moonSky.x,
        dy: kin.moonSky.y,
        r: params.moon.r,
      });
    }
  }

  return occulters;
}
