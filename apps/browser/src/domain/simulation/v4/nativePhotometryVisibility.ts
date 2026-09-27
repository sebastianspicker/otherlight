/** Computes native V4 geometric overlap and stellar visibility. */
import { clamp01, clamp11 } from "../../model/units";
import type { CircleOcculter } from "../../photometry/occulterCircle";
import { resolveAndValidateLimbDarkeningForStar } from "../../photometry/limbDarkening";
import { fluxLimbDarkenedDiskDetailed } from "../../photometry/transitLimbDarkened";
import { fluxStarWithTransmissiveOcculters } from "../../photometry/transitTransmission";
import type { VisibilityOcculter, VisibilityStar } from "./nativePhotometryTypes";
import type { EducationScenarioV4, StarBodyV4 } from "./types";

export function circleOverlapArea(r1: number, r2: number, d: number): number {
  if (!(Number.isFinite(r1) && r1 > 0 && Number.isFinite(r2) && r2 > 0 && Number.isFinite(d) && d >= 0))
    return 0;
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) {
    const rMin = Math.min(r1, r2);
    return Math.PI * rMin * rMin;
  }
  const x = (d * d + r1 * r1 - r2 * r2) / (2 * d);
  const y = Math.sqrt(Math.max(0, r1 * r1 - x * x));
  const a1 = Math.acos(clamp11(x / r1));
  const a2 = Math.acos(clamp11((d - x) / r2));
  return r1 * r1 * a1 + r2 * r2 * a2 - d * y;
}

export function gaussianPhaseWeight(phase: number, sigma: number): number {
  const d = Math.atan2(Math.sin(phase), Math.cos(phase));
  const s = Math.max(1e-6, sigma);
  return Math.exp(-(d * d) / (2 * s * s));
}

export function starVisibilityFromOpaqueOcculters(
  config: EducationScenarioV4,
  star: VisibilityStar,
  occulters: Array<{ r: number; sky: { x: number; y: number; z: number } }>,
): number {
  return starVisibilityFromOcculters(
    config,
    star,
    occulters.map((occulter) => ({ ...occulter, opacity: 1 })),
  );
}

export function starVisibilityFromOcculters(
  config: EducationScenarioV4,
  star: VisibilityStar,
  occulters: VisibilityOcculter[],
): number {
  if (!(star.r > 0) || occulters.length === 0) return 1;
  const circles = circleOccultersForStar(star, occulters);
  const opacities = occulters.map(occulterOpacity);
  const allOpaque = occulters.every(
    (occulter, index) => !occulter.transmissionAtRadius && opacities[index] >= 1 - 1e-12,
  );
  const limbDarkeningLaw = resolveStarLimbDarkeningLaw(config, star);
  if (limbDarkeningLaw && allOpaque) {
    return fluxLimbDarkenedDiskDetailed({
      rStar: star.r,
      rOcculters: circles,
      limbDarkeningLaw,
      gridRes: config.photometry?.gridRes,
    }).flux;
  }
  return fluxStarWithTransmissiveOcculters({
    rStar: star.r,
    occulters: occulters.map((occulter, index) => ({
      dx: occulter.sky.x - star.sky.x,
      dy: occulter.sky.y - star.sky.y,
      r0: occulter.r,
      transmission:
        occulter.transmissionAtRadius ?? ((rho) => (rho <= occulter.r ? 1 - opacities[index] : 1)),
    })),
    limbDarkening: limbDarkeningLaw,
    gridRes: config.photometry?.gridRes,
  });
}

const circleOccultersForStar = (star: VisibilityStar, occulters: VisibilityOcculter[]): CircleOcculter[] =>
  occulters.map((occulter) => ({
    dx: occulter.sky.x - star.sky.x,
    dy: occulter.sky.y - star.sky.y,
    r: occulter.r,
  }));
const occulterOpacity = (occulter: VisibilityOcculter): number =>
  clamp01(Number.isFinite(occulter.opacity) ? (occulter.opacity as number) : 1);

const resolveStarLimbDarkeningLaw = (config: EducationScenarioV4, star: VisibilityStar) => {
  const model = config.photometry?.limbDarkeningModel;
  if (!model) return undefined;
  const stellarSource = star.kind === "star" ? (star.source as StarBodyV4) : undefined;
  return resolveAndValidateLimbDarkeningForStar({
    model,
    star: stellarSource
      ? {
          teffK: stellarSource.teffK,
          loggCgs: stellarSource.loggCgs,
          metallicityDex: stellarSource.metallicityDex,
          bandpass: stellarSource.passband,
        }
      : undefined,
  });
};
