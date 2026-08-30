/**
 * Owns patch Types support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
export type PatchPreCircle = {
  kind: "circle";
  x: number;
  y: number;
  factor: number;
  r2: number;
};

export type PatchPreEllipse = {
  kind: "ellipse";
  x: number;
  y: number;
  factor: number;
  invRx2: number;
  invRy2: number;
  cosA: number;
  sinA: number;
};

export type PatchPre = PatchPreCircle | PatchPreEllipse;
