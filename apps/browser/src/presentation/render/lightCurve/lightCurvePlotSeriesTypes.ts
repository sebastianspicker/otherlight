/** Shared drawing inputs for dense and sparse light-curve plot series. */
export type DrawSeriesArgs = {
  ctx: CanvasRenderingContext2D;
  fluxValues: number[];
  timeValues: number[];
  visibleStart: number;
  n: number;
  xIndexOffset: number;
  indexScale: number;
  yOffset: number;
  yScale: number;
  xTimeOffset: number;
  timeScale: number;
  plotW: number;
  haveTime: boolean;
  allFiniteTime: boolean;
};
