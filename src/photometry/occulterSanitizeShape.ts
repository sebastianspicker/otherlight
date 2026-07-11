import type { OcculterShape } from "./occulterEllipse";
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
