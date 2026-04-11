import { clamp01, clamp11 } from "../../core/units";
import type { CircleOcculter } from "../../photometry/occulterCircle";
import { effectiveCircleAtmosphereOpacity } from "../../photometry/atmosphereRT/model";
import { resolveAndValidateLimbDarkeningForStar } from "../../photometry/limbDarkening";
import { fluxLimbDarkenedDiskDetailed } from "../../photometry/transitLimbDarkened";
import type { SimulationConfigV4, StarBodyV4 } from "./types";

export function circleOverlapArea(r1: number, r2: number, d: number): number {
  if (!(Number.isFinite(r1) && r1 > 0 && Number.isFinite(r2) && r2 > 0 && Number.isFinite(d) && d >= 0))
    return 0;
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) {
    const rMin = Math.min(r1, r2);
    return Math.PI * rMin * rMin;
  }
  const x = (d * d + r1 * r1 - r2 * r2) / (2 * d);
  const y2 = Math.max(0, r1 * r1 - x * x);
  const y = Math.sqrt(y2);
  const a1 = Math.acos(clamp11(x / r1));
  const a2 = Math.acos(clamp11((d - x) / r2));
  return r1 * r1 * a1 + r2 * r2 * a2 - d * y;
}

export function atmosphereOpacityForOcculter(
  config: SimulationConfigV4,
  body: { kind: "star" | "planet" | "moon"; r: number },
): number {
  const rt = config.photometry?.atmosphereRT;
  if (!rt?.enabled || !Array.isArray(rt.layers) || rt.layers.length === 0) return 1;
  const target = body.kind === "moon" ? "moon" : body.kind === "planet" ? "planet" : undefined;
  if (!target || rt.target !== target) return 1;
  return clamp01(
    effectiveCircleAtmosphereOpacity({
      bodyRadius: body.r,
      config: {
        ...rt,
        layers: rt.layers,
      },
    }),
  );
}

export function gaussianPhaseWeight(phase: number, sigma: number): number {
  const d = Math.atan2(Math.sin(phase), Math.cos(phase));
  const s = Math.max(1e-6, sigma);
  return Math.exp(-(d * d) / (2 * s * s));
}

export function starVisibilityFromOpaqueOcculters(
  config: SimulationConfigV4,
  star: {
    kind: "star" | "planet" | "moon";
    r: number;
    sky: { x: number; y: number; z: number };
    source: StarBodyV4 | unknown;
  },
  occulters: Array<{ r: number; sky: { x: number; y: number; z: number } }>,
): number {
  if (!(star.r > 0) || occulters.length === 0) return 1;

  const circles: CircleOcculter[] = occulters.map((oc) => ({
    dx: oc.sky.x - star.sky.x,
    dy: oc.sky.y - star.sky.y,
    r: oc.r,
  }));

  const ldModel = config.photometry?.limbDarkeningModel;
  const stellarSource = star.kind === "star" ? (star.source as StarBodyV4) : undefined;
  const ldLaw = ldModel
    ? resolveAndValidateLimbDarkeningForStar({
        model: ldModel,
        star: stellarSource
          ? {
              teffK: stellarSource.teffK,
              loggCgs: stellarSource.loggCgs,
              metallicityDex: stellarSource.metallicityDex,
              bandpass: stellarSource.passband,
            }
          : undefined,
      })
    : undefined;

  if (ldLaw) {
    return fluxLimbDarkenedDiskDetailed({
      rStar: star.r,
      rOcculters: circles,
      limbDarkeningLaw: ldLaw,
      gridRes: config.photometry?.gridRes,
    }).flux;
  }

  const areaStar = Math.PI * star.r * star.r;
  let blocked = 0;
  for (const oc of occulters) {
    const d = Math.hypot(oc.sky.x - star.sky.x, oc.sky.y - star.sky.y);
    if (!(d < star.r + oc.r)) continue;
    blocked += circleOverlapArea(star.r, oc.r, d);
  }
  return clamp01(1 - Math.min(1, blocked / areaStar));
}
