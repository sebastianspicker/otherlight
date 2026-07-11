import { isFinitePositive } from "../core/units";
import type { EllipseOcculter } from "./occulterEllipse";
import { hasFiniteCenter, overlapsStarByRadius } from "./occulterSanitizeGeometry";

export function sanitizeEllipseOcculter(rStar: number, o: EllipseOcculter): EllipseOcculter | undefined {
  if (!hasFiniteCenter(o)) return undefined;
  if (!isFinitePositive(o.rx) || !isFinitePositive(o.ry)) return undefined;

  const rMax = Math.max(o.rx, o.ry);
  return overlapsStarByRadius(o.dx, o.dy, rMax, rStar) ? o : undefined;
}
