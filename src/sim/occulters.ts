// src/sim/occulters.ts

import type { SystemParams } from "../core/types";
import { clamp, isFinitePositive } from "../core/units";
import type { CircleOcculter } from "../photometry/occulterCircle";
import type { EllipseOcculter, OcculterShape, RingOcculter } from "../photometry/occulterEllipse";
import type { BodyKinematics } from "./kinematics";

function buildBodyOcculters(args: {
  rStar: number;
  sky: { x: number; y: number; z: number } | undefined;
  rBody: number;
  shape?: { oblateness?: number; angle?: number };
  rings?: { innerRadius: number; outerRadius: number; inclination?: number; positionAngle?: number };
}): OcculterShape[] {
  const { rStar, sky, rBody, shape, rings } = args;
  const out: OcculterShape[] = [];

  if (!sky) return out;
  if (!(sky.z > 0)) return out;
  if (!isFinitePositive(rStar) || !isFinitePositive(rBody)) return out;
  if (!Number.isFinite(sky.x) || !Number.isFinite(sky.y)) return out;

  const d = Math.hypot(sky.x, sky.y);
  if (!Number.isFinite(d)) return out;

  const oblateness = Number.isFinite(shape?.oblateness) ? clamp(shape!.oblateness as number, 0, 0.95) : 0;
  const hasOblate = oblateness > 0;

  if (hasOblate) {
    const rx = rBody;
    const ry = rBody * (1 - oblateness);
    if (isFinitePositive(ry)) {
      const rMax = Math.max(rx, ry);
      if (d < rStar + rMax) {
        out.push({
          kind: "ellipse",
          dx: sky.x,
          dy: sky.y,
          rx,
          ry,
          angle: Number.isFinite(shape?.angle) ? (shape!.angle as number) : 0,
        } as EllipseOcculter);
      }
    }
  } else {
    if (d < rStar + rBody) {
      out.push({ dx: sky.x, dy: sky.y, r: rBody } as CircleOcculter);
    }
  }

  if (rings) {
    const rInner = Number.isFinite(rings.innerRadius) ? Math.max(0, rings.innerRadius) : 0;
    const rOuter = rings.outerRadius;
    if (isFinitePositive(rOuter) && rOuter > rInner) {
      if (d < rStar + rOuter) {
        out.push({
          kind: "ring",
          dx: sky.x,
          dy: sky.y,
          rInner,
          rOuter,
          inc: Number.isFinite(rings.inclination) ? rings.inclination : 0,
          angle: Number.isFinite(rings.positionAngle) ? rings.positionAngle : 0,
        } as RingOcculter);
      }
    }
  }

  return out;
}

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
