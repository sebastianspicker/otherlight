/**
 * Owns spectral Feature Arrays support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import type { SpectralGaussianFeatureParams } from "../../core/typesPhotometryAtmosphere";

export function spectralFeatureArray(values: number[] | undefined): number[] {
  return Array.isArray(values) ? values : [];
}

export function spectralFeatureCount(feature: SpectralGaussianFeatureParams): number {
  return Math.min(
    spectralFeatureArray(feature.centerNm).length,
    spectralFeatureArray(feature.widthNm).length,
    spectralFeatureArray(feature.strength).length,
  );
}
