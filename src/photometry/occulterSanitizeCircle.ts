/**
 * Owns occulter Sanitize Circle support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import { isFinitePositive } from "../core/units";
import type { CircleOcculter } from "./occulterCircle";
import { hasFiniteCenter, overlapsStarByRadius } from "./occulterSanitizeGeometry";

export function sanitizeCircleOcculter(rStar: number, o: CircleOcculter): CircleOcculter | undefined {
  if (!hasFiniteCenter(o) || !isFinitePositive(o.r)) return undefined;
  return overlapsStarByRadius(o.dx, o.dy, o.r, rStar) ? o : undefined;
}
