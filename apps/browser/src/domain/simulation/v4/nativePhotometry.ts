/** Stable facade for native V4 photometry calculations. */
export { resolveWeightedPhotometryBands } from "./nativePhotometryBands";
export { atmosphereOpacityForOcculter, photometricOcculterForBody } from "./nativePhotometryAtmosphere";
export {
  circleOverlapArea,
  gaussianPhaseWeight,
  starVisibilityFromOcculters,
  starVisibilityFromOpaqueOcculters,
} from "./nativePhotometryVisibility";
