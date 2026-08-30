/** Shared geometric occulter contracts accepted by photometry calculations. */
import type { CircleOcculter } from "./occulterCircle";

export type EllipseOcculter = {
  kind: "ellipse";
  dx: number;
  dy: number;
  rx: number;
  ry: number;
  /** Rotation of the ellipse major axis in the sky plane [rad]. */
  angle?: number;
};

export type RingOcculter = {
  kind: "ring";
  dx: number;
  dy: number;
  /** Inner ring radius in the body plane [m]. */
  rInner: number;
  /** Outer ring radius in the body plane [m]. */
  rOuter: number;
  /** Ring tilt away from face-on [rad], 0 = face-on, pi/2 = edge-on. */
  inc?: number;
  /** Position angle of ring major axis in the sky plane [rad]. */
  angle?: number;
  /** Ring opacity in [0,1]. 0 = transparent, 1 = opaque (default). */
  opacity?: number;
};

/** Canonical mixed-shape occulter union used by simulation and photometry. */
export type OcculterShape = CircleOcculter | EllipseOcculter | RingOcculter;
