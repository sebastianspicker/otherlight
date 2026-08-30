/**
 * Owns occulter Sanitize Shape support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import type { OcculterShape } from "./occulterTypes";
import { isCircleOcculter, isEllipseOcculter, isRingOcculter } from "./occulterShapeGuards";
import { sanitizeCircleOcculter } from "./occulterSanitizeCircle";
import { sanitizeEllipseOcculter } from "./occulterSanitizeEllipse";
import { sanitizeRingOcculter } from "./occulterSanitizeRing";

export function sanitizeOcculterShape(
  rStar: number,
  o: OcculterShape | null | undefined,
): OcculterShape | undefined {
  if (!o) return undefined;
  if (isCircleOcculter(o)) return sanitizeCircleOcculter(rStar, o);
  if (isEllipseOcculter(o)) return sanitizeEllipseOcculter(rStar, o);
  if (isRingOcculter(o)) return sanitizeRingOcculter(rStar, o);
  return undefined;
}
