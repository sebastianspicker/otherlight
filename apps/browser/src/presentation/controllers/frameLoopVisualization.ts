/**
 * Frame-loop visualization barrel: stable public API for plot overlays and fixed previews.
 */
export {
  initializeVisualizationState,
  setPlotOverlaySeries,
  setPlotWindowOverlays,
  setPlotMarkers,
  setPlotBadges,
  setPlotComparisonInset,
  setSceneDidacticOverlayForRenderer,
  resolveDisplayFlux,
  pushFinitePlotSample,
  displayFluxFromStep,
  pushHistorySamples,
} from "./frameLoopVisualizationHelpers";
export {
  buildEpochGhosts,
  applyDynamicVisualizationState,
  type ApplyDynamicVisualizationStateArgs,
} from "./frameLoopDynamicVisualization";
export { clearFixedComparisonRange, rebuildFixedPlot } from "./frameLoopFixedPlot";
