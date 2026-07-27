/**
 * Owns occulters Body support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import { isFinitePositive } from "../core/units";
import type { OcculterShape } from "../photometry/occulterEllipse";
import type { BodyOcculterArgs } from "./occulters";
import { bodySilhouetteOcculters } from "./occultersBodySilhouette";
import { ringOcculters } from "./occultersBodyRings";

export function buildBodyOcculters(args: BodyOcculterArgs): OcculterShape[] {
  const d = projectedDistance(args);
  if (d === undefined) return [];

  return [...bodySilhouetteOcculters(args, d), ...ringOcculters(args, d)];
}

function projectedDistance({ rStar, sky, rBody }: BodyOcculterArgs): number | undefined {
  if (!sky || !(sky.z > 0)) return undefined;
  if (!isFinitePositive(rStar) || !isFinitePositive(rBody)) return undefined;
  if (!Number.isFinite(sky.x) || !Number.isFinite(sky.y)) return undefined;

  const d = Math.hypot(sky.x, sky.y);
  return Number.isFinite(d) ? d : undefined;
}
