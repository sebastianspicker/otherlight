/** Shared canvas sizing contract used by rendering primitives. */
export type SizeInfo = {
  /** Device pixel ratio used for backing store scaling. */
  dpr: number;

  /** Canvas size in CSS pixels as reported by layout. */
  cssW: number;
  cssH: number;

  /** Canvas backing store size in device pixels (canvas.width/height). */
  pxW: number;
  pxH: number;
};
