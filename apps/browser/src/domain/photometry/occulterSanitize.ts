/**
 * Owns occulter Sanitize support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import { isFinitePositive } from "../model/units";
import type { OcculterShape } from "./occulterTypes";
import { sanitizeOcculterShape } from "./occulterSanitizeShape";

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
