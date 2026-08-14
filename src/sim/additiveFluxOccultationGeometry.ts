/** Geometric primitives used internally by additive-flux occultation. */
import type { CircleOcculter } from "../photometry/occulterCircle";
import { fluxUniformDisk } from "../photometry/transitUniform";
import type { SkyPosition } from "./additiveFluxTypes";

const MUTUAL_OCCULTER_GRID_RES = 120;

export function frontOcculterForTarget(
  targetSky: SkyPosition,
  occulterSky: SkyPosition,
  rOcculter: number,
): CircleOcculter | undefined {
  if (!Number.isFinite(rOcculter) || rOcculter <= 0) return undefined;
  const finite = (sky: SkyPosition): boolean =>
    Number.isFinite(sky.x) && Number.isFinite(sky.y) && Number.isFinite(sky.z);
  if (!finite(targetSky) || !finite(occulterSky) || !(occulterSky.z > targetSky.z)) return undefined;
  return { dx: occulterSky.x - targetSky.x, dy: occulterSky.y - targetSky.y, r: rOcculter };
}

export function addOcculterIfFront(
  occulters: CircleOcculter[],
  targetSky: SkyPosition,
  occulterSky: SkyPosition,
  rOcculter: number,
): void {
  const occulter = frontOcculterForTarget(targetSky, occulterSky, rOcculter);
  if (occulter) occulters.push(occulter);
}

export function visibleFractionWithOcculters(rTarget: number, occulters: CircleOcculter[]): number {
  if (!Number.isFinite(rTarget) || rTarget <= 0 || occulters.length === 0) return 1;
  try {
    return fluxUniformDisk({ rStar: rTarget, rOcculters: occulters, gridRes: MUTUAL_OCCULTER_GRID_RES });
  } catch {
    return 1;
  }
}

export function effectiveProjectedRadius(body: {
  r: number;
  shape?: { oblateness?: number };
  rings?: { outerRadius: number };
}): number {
  const rBody = Number.isFinite(body.r) && body.r > 0 ? body.r : 0;
  const f = Number.isFinite(body.shape?.oblateness)
    ? Math.max(0, Math.min(0.95, body.shape!.oblateness as number))
    : 0;
  const oblateEquiv = rBody * (1 - 0.5 * f);
  const ringOuter = Number.isFinite(body.rings?.outerRadius)
    ? Math.max(0, body.rings!.outerRadius as number)
    : 0;
  return Math.max(oblateEquiv, ringOuter, rBody);
}
