import { isFiniteNumber, isFinitePositive } from "../core/units";
import type { RingOcculter } from "./occulterEllipse";

export function overlapsStarByRadius(dx: number, dy: number, rOccMax: number, rStar: number): boolean {
  if (!isFinitePositive(rStar) || !isFinitePositive(rOccMax)) return false;
  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d)) return false;
  // Tangency is measure-zero: treat d >= rStar + rOccMax as no overlap.
  return d < rStar + rOccMax;
}

export function hasFiniteCenter(o: { dx: number; dy: number }): boolean {
  return isFiniteNumber(o.dx) && isFiniteNumber(o.dy);
}

export function normalizedRingInnerRadius(o: RingOcculter): number {
  return Number.isFinite(o.rInner) ? Math.max(0, o.rInner) : 0;
}
