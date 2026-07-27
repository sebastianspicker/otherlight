/**
 * Owns occulters Body Silhouette support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import { clamp, isFinitePositive } from "../core/units";
import type { CircleOcculter } from "../photometry/occulterCircle";
import type { EllipseOcculter, OcculterShape } from "../photometry/occulterEllipse";
import type { BodyOcculterArgs } from "./occulters";

export function bodySilhouetteOcculters(args: BodyOcculterArgs, d: number): OcculterShape[] {
  const oblateness = bodyOblateness(args.shape);
  return oblateness > 0 ? ellipseOcculters(args, d, oblateness) : circleOcculters(args, d);
}

function bodyOblateness(shape: BodyOcculterArgs["shape"]): number {
  return Number.isFinite(shape?.oblateness) ? clamp(shape!.oblateness as number, 0, 0.95) : 0;
}

function ellipseOcculters(args: BodyOcculterArgs, d: number, oblateness: number): OcculterShape[] {
  const { rStar, sky, rBody, shape } = args;
  const rx = rBody;
  const ry = rBody * (1 - oblateness);
  const rMax = Math.max(rx, ry);
  if (!sky || !isFinitePositive(ry) || d >= rStar + rMax) return [];

  return [
    {
      kind: "ellipse",
      dx: sky.x,
      dy: sky.y,
      rx,
      ry,
      angle: Number.isFinite(shape?.angle) ? (shape!.angle as number) : 0,
    } as EllipseOcculter,
  ];
}

function circleOcculters(args: BodyOcculterArgs, d: number): OcculterShape[] {
  const { rStar, sky, rBody } = args;
  if (!sky || d >= rStar + rBody) return [];

  return [{ dx: sky.x, dy: sky.y, r: rBody } as CircleOcculter];
}
