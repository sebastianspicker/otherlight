/**
 * Owns occulter Sanitize Ring support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import { isFinitePositive } from "../model/units";
import type { RingOcculter } from "./occulterTypes";
import { hasFiniteCenter, normalizedRingInnerRadius, overlapsStarByRadius } from "./occulterSanitizeGeometry";

export function sanitizeRingOcculter(rStar: number, o: RingOcculter): RingOcculter | undefined {
  if (!hasFiniteCenter(o) || !isFinitePositive(o.rOuter)) return undefined;

  const rInner = normalizedRingInnerRadius(o);
  if (!(o.rOuter > rInner)) return undefined;
  if (!overlapsStarByRadius(o.dx, o.dy, o.rOuter, rStar)) return undefined;

  return { ...o, rInner };
}
