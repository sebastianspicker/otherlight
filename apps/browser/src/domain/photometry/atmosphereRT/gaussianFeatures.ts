/**
 * Owns gaussian Features support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import type { SpectralGaussianFeatureParams } from "../../model/typesPhotometryAtmosphere";
import { spectralFeatureArray, spectralFeatureCount } from "./spectralFeatureArrays";

export function gaussianFeatureStrength(
  lambdaNm: number | undefined,
  feature: SpectralGaussianFeatureParams | undefined,
): number {
  if (!feature?.enabled || !Number.isFinite(lambdaNm)) return 0;
  const centers = spectralFeatureArray(feature.centerNm);
  const widths = spectralFeatureArray(feature.widthNm);
  const strengths = spectralFeatureArray(feature.strength);
  const n = spectralFeatureCount(feature);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const c = centers[i];
    const w = widths[i];
    const s = strengths[i];
    if (!isValidGaussianFeaturePoint(c, w, s)) continue;
    sum += gaussianFeaturePointStrength(lambdaNm as number, c, w, s);
  }
  return Math.max(0, sum);
}

function isValidGaussianFeaturePoint(center: number, width: number, strength: number): boolean {
  return (
    Number.isFinite(center) &&
    Number.isFinite(width) &&
    width > 0 &&
    Number.isFinite(strength) &&
    strength > 0
  );
}

function gaussianFeaturePointStrength(
  lambdaNm: number,
  center: number,
  width: number,
  strength: number,
): number {
  const d = lambdaNm - center;
  return strength * Math.exp(-(d * d) / (2 * width * width));
}
