/**
 * Owns canvas2d Scene support within the render layer. Keeps visual projection and drawing concerns out of simulation state.
 */
export { drawStarGeometry } from "./sceneStars";
export {
  resolveOcculterGeometry,
  fillOverlayData,
  drawEventMarkers,
  drawDidacticOverlay,
  drawOcculterGeometry,
} from "./sceneOverlays";
export type { AtmosphereHaloStyle, SceneDidacticOverlayState, ScratchPoint, ToPxInto } from "./sceneTypes";
