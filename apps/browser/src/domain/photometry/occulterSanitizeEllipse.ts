/**
 * Owns occulter Sanitize Ellipse support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import { isFinitePositive } from "../model/units";
import type { EllipseOcculter } from "./occulterTypes";
import { hasFiniteCenter, overlapsStarByRadius } from "./occulterSanitizeGeometry";

export function sanitizeEllipseOcculter(rStar: number, o: EllipseOcculter): EllipseOcculter | undefined {
  if (!hasFiniteCenter(o)) return undefined;
  if (!isFinitePositive(o.rx) || !isFinitePositive(o.ry)) return undefined;

  const rMax = Math.max(o.rx, o.ry);
  return overlapsStarByRadius(o.dx, o.dy, rMax, rStar) ? o : undefined;
}
