import { isFinitePositive } from "../core/units";
import type { RingOcculter } from "./occulterEllipse";
import { hasFiniteCenter, normalizedRingInnerRadius, overlapsStarByRadius } from "./occulterSanitizeGeometry";

export function sanitizeRingOcculter(rStar: number, o: RingOcculter): RingOcculter | undefined {
  if (!hasFiniteCenter(o) || !isFinitePositive(o.rOuter)) return undefined;

  const rInner = normalizedRingInnerRadius(o);
  if (!(o.rOuter > rInner)) return undefined;
  if (!overlapsStarByRadius(o.dx, o.dy, o.rOuter, rStar)) return undefined;

  return { ...o, rInner };
}
