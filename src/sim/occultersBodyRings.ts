/**
 * Owns occulters Body Rings support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import { isFinitePositive } from "../core/units";
import type { OcculterShape, RingOcculter } from "../photometry/occulterEllipse";
import type { BodyOcculterArgs } from "./occulters";

export function ringOcculters(args: BodyOcculterArgs, d: number): OcculterShape[] {
  const { rStar, sky, rings } = args;
  if (!sky || !rings) return [];

  const rInner = ringInnerRadius(rings);
  const rOuter = rings.outerRadius;
  if (!isFinitePositive(rOuter) || rOuter <= rInner || d >= rStar + rOuter) return [];

  return [
    {
      kind: "ring",
      dx: sky.x,
      dy: sky.y,
      rInner,
      rOuter,
      inc: Number.isFinite(rings.inclination) ? rings.inclination : 0,
      angle: Number.isFinite(rings.positionAngle) ? rings.positionAngle : 0,
      opacity: ringOpacity(rings.opacity),
    } as RingOcculter,
  ];
}

function ringInnerRadius(rings: NonNullable<BodyOcculterArgs["rings"]>): number {
  return Number.isFinite(rings.innerRadius) ? Math.max(0, rings.innerRadius) : 0;
}

function ringOpacity(rawOpacity: number | undefined): number {
  return typeof rawOpacity === "number" && Number.isFinite(rawOpacity)
    ? Math.max(0, Math.min(1, rawOpacity))
    : 1;
}
