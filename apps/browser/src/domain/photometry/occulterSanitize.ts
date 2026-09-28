/**
 * Sanitizes a list of occulter shapes before photometry.
 */
import { isFiniteNumber, isFinitePositive } from "../model/units";
import type { CircleOcculter } from "./occulterCircle";
import { isCircleOcculter, isEllipseOcculter, isRingOcculter } from "./occulterShapeGuards";
import type { EllipseOcculter, OcculterShape, RingOcculter } from "./occulterTypes";

function overlapsStarByRadius(dx: number, dy: number, rOccMax: number, rStar: number): boolean {
  if (!isFinitePositive(rStar) || !isFinitePositive(rOccMax)) return false;
  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d)) return false;
  // Tangency is measure-zero: treat d >= rStar + rOccMax as no overlap.
  return d < rStar + rOccMax;
}

function hasFiniteCenter(o: { dx: number; dy: number }): boolean {
  return isFiniteNumber(o.dx) && isFiniteNumber(o.dy);
}

function normalizedRingInnerRadius(o: RingOcculter): number {
  return Number.isFinite(o.rInner) ? Math.max(0, o.rInner) : 0;
}

function sanitizeCircleOcculter(rStar: number, o: CircleOcculter): CircleOcculter | undefined {
  if (!hasFiniteCenter(o) || !isFinitePositive(o.r)) return undefined;
  return overlapsStarByRadius(o.dx, o.dy, o.r, rStar) ? o : undefined;
}

function sanitizeEllipseOcculter(rStar: number, o: EllipseOcculter): EllipseOcculter | undefined {
  if (!hasFiniteCenter(o)) return undefined;
  if (!isFinitePositive(o.rx) || !isFinitePositive(o.ry)) return undefined;

  const rMax = Math.max(o.rx, o.ry);
  return overlapsStarByRadius(o.dx, o.dy, rMax, rStar) ? o : undefined;
}

function sanitizeRingOcculter(rStar: number, o: RingOcculter): RingOcculter | undefined {
  if (!hasFiniteCenter(o) || !isFinitePositive(o.rOuter)) return undefined;

  const rInner = normalizedRingInnerRadius(o);
  if (!(o.rOuter > rInner)) return undefined;
  if (!overlapsStarByRadius(o.dx, o.dy, o.rOuter, rStar)) return undefined;

  return { ...o, rInner };
}

function sanitizeOcculterShape(
  rStar: number,
  o: OcculterShape | null | undefined,
): OcculterShape | undefined {
  if (!o) return undefined;
  if (isCircleOcculter(o)) return sanitizeCircleOcculter(rStar, o);
  if (isEllipseOcculter(o)) return sanitizeEllipseOcculter(rStar, o);
  if (isRingOcculter(o)) return sanitizeRingOcculter(rStar, o);
  return undefined;
}

/**
 * Filter a mixed list of occulters for validity and potential overlap with the star.
 * Uses conservative bounding radii for non-circular shapes.
 */
export function sanitizeOcculterShapes(rStar: number, occulters?: readonly OcculterShape[]): OcculterShape[] {
  const out: OcculterShape[] = [];
  if (!isFinitePositive(rStar)) return out;
  if (!Array.isArray(occulters) || occulters.length === 0) return out;

  for (const o of occulters) {
    const sanitized = sanitizeOcculterShape(rStar, o);
    if (sanitized) out.push(sanitized);
  }

  return out;
}
