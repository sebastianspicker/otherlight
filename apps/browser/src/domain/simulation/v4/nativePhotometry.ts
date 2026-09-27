/** Stable facade for native V4 photometry calculations. */
export { resolveWeightedPhotometryBands } from "./nativePhotometryBands";
export type { WeightedPhotometryBand } from "./nativePhotometryTypes";
export { atmosphereOpacityForOcculter, photometricOcculterForBody } from "./nativePhotometryAtmosphere";
export {
  circleOverlapArea,
  gaussianPhaseWeight,
  starVisibilityFromOcculters,
  starVisibilityFromOpaqueOcculters,
} from "./nativePhotometryVisibility";
