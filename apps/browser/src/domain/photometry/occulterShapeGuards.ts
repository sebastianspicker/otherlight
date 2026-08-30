/**
 * Owns occulter Shape Guards support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import type { CircleOcculter } from "./occulterCircle";
import type { EllipseOcculter, OcculterShape, RingOcculter } from "./occulterTypes";

export function isCircleOcculter(o: OcculterShape): o is CircleOcculter {
  return !("kind" in o) || o.kind === undefined || o.kind === "circle";
}

export function isEllipseOcculter(o: OcculterShape): o is EllipseOcculter {
  return "kind" in o && o.kind === "ellipse";
}

export function isRingOcculter(o: OcculterShape): o is RingOcculter {
  return "kind" in o && o.kind === "ring";
}
