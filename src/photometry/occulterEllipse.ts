/** Defines sky-plane elliptical and ring occulters for transit integration. */
//
// Elliptical and ring occulters for transit photometry (sky-plane geometry).
//
// Conventions (match occulterCircle.ts and transit integrators):
// - Coordinates are in the sky plane, star centered at (0,0).
// - Tangency is measure-zero: boundary points are treated as NOT blocked.
// - Ellipses are defined by semi-axes (rx, ry) and an optional rotation angle.
// - Rings are annular ellipses produced by projecting a circular ring with tilt.

import { isFiniteNumber, isFinitePositive } from "../core/units";
import { type CircleOcculter } from "./occulterCircle";
import { isCircleOcculter, isEllipseOcculter, isRingOcculter } from "./occulterShapeGuards";
export { sanitizeOcculterShapes } from "./occulterSanitize";
export { isCircleOcculter, isEllipseOcculter, isRingOcculter } from "./occulterShapeGuards";

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
  /** Ring opacity in [0,1]. 0 = fully transparent, 1 = fully opaque (default). */
  opacity?: number;
};

export type OcculterShape = CircleOcculter | EllipseOcculter | RingOcculter;

function hasFiniteCenter(o: { dx: number; dy: number }): boolean {
  return isFiniteNumber(o.dx) && isFiniteNumber(o.dy);
}

type CirclePre = { kind: "circle"; dx: number; dy: number; r2: number };

type EllipsePre = {
  kind: "ellipse";
  dx: number;
  dy: number;
  cosA: number;
  sinA: number;
  invRx2: number;
  invRy2: number;
};

type RingPre = {
  kind: "ring";
  dx: number;
  dy: number;
  cosA: number;
  sinA: number;
  invOuterRx2: number;
  invOuterRy2: number;
  invInnerRx2?: number;
  invInnerRy2?: number;
  /** Ring opacity in [0,1]. 1 = fully opaque (default). */
  opacity: number;
};

export type OcculterPre = CirclePre | EllipsePre | RingPre;

type Rotation = {
  cosA: number;
  sinA: number;
};

type EllipsePointTest = Rotation & {
  x: number;
  y: number;
  dx: number;
  dy: number;
  invRx2: number;
  invRy2: number;
  inclusive?: boolean;
};

function finiteAngle(angle: number | undefined): number {
  return typeof angle === "number" && Number.isFinite(angle) ? angle : 0;
}

function rotationForAngle(angle: number | undefined): Rotation {
  const safeAngle = finiteAngle(angle);
  return { cosA: Math.cos(safeAngle), sinA: Math.sin(safeAngle) };
}

function clampedOpacity(opacity: number | undefined): number {
  return typeof opacity === "number" && Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
}

function normalizedRingInnerRadius(o: RingOcculter): number {
  return Number.isFinite(o.rInner) ? Math.max(0, o.rInner) : 0;
}

function precomputeCircleOcculter(o: CircleOcculter): OcculterPre | undefined {
  if (!hasFiniteCenter(o) || !isFinitePositive(o.r)) return undefined;
  return { kind: "circle", dx: o.dx, dy: o.dy, r2: o.r * o.r };
}

function precomputeEllipseOcculter(o: EllipseOcculter): OcculterPre | undefined {
  if (!hasFiniteCenter(o)) return undefined;
  if (!isFinitePositive(o.rx) || !isFinitePositive(o.ry)) return undefined;

  const { cosA, sinA } = rotationForAngle(o.angle);
  return {
    kind: "ellipse",
    dx: o.dx,
    dy: o.dy,
    cosA,
    sinA,
    invRx2: 1 / (o.rx * o.rx),
    invRy2: 1 / (o.ry * o.ry),
  };
}

function projectedRingAxes(
  o: RingOcculter,
): { rInner: number; outerRy: number; innerRy: number } | undefined {
  if (!isFinitePositive(o.rOuter)) return undefined;

  const rInner = normalizedRingInnerRadius(o);
  if (!(o.rOuter > rInner)) return undefined;

  const cosInc = Math.abs(Math.cos(finiteAngle(o.inc)));
  const outerRy = o.rOuter * cosInc;
  if (!(outerRy > 0)) return undefined; // edge-on -> zero area, ignore

  return { rInner, outerRy, innerRy: rInner * cosInc };
}

function precomputeRingOcculter(o: RingOcculter): OcculterPre | undefined {
  if (!hasFiniteCenter(o)) return undefined;

  const axes = projectedRingAxes(o);
  if (!axes) return undefined;

  const { cosA, sinA } = rotationForAngle(o.angle);
  return {
    kind: "ring",
    dx: o.dx,
    dy: o.dy,
    cosA,
    sinA,
    invOuterRx2: 1 / (o.rOuter * o.rOuter),
    invOuterRy2: 1 / (axes.outerRy * axes.outerRy),
    invInnerRx2: axes.rInner > 0 ? 1 / (axes.rInner * axes.rInner) : undefined,
    invInnerRy2: axes.rInner > 0 && axes.innerRy > 0 ? 1 / (axes.innerRy * axes.innerRy) : undefined,
    opacity: clampedOpacity(o.opacity),
  };
}

function precomputeOcculterShape(o: OcculterShape | null | undefined): OcculterPre | undefined {
  if (!o) return undefined;
  if (isCircleOcculter(o)) return precomputeCircleOcculter(o);
  if (isEllipseOcculter(o)) return precomputeEllipseOcculter(o);
  if (isRingOcculter(o)) return precomputeRingOcculter(o);
  return undefined;
}

/**
 * Precompute occulter coefficients for fast point-in-shape tests.
 */
export function precomputeOcculterShapes(occulters: OcculterShape[]): OcculterPre[] {
  const out: OcculterPre[] = [];
  if (!Array.isArray(occulters) || occulters.length === 0) return out;

  for (const o of occulters) {
    const precomputed = precomputeOcculterShape(o);
    if (precomputed) out.push(precomputed);
  }

  return out;
}

function normalizedEllipseDistanceSquared(test: EllipsePointTest): number {
  const { x, y, dx, dy, cosA, sinA, invRx2, invRy2 } = test;
  const xp = x - dx;
  const yp = y - dy;
  const xr = xp * cosA + yp * sinA;
  const yr = -xp * sinA + yp * cosA;
  return xr * xr * invRx2 + yr * yr * invRy2;
}

function pointInEllipse(test: EllipsePointTest): boolean {
  const v = normalizedEllipseDistanceSquared(test);
  if (test.inclusive) return v <= 1;
  return v < 1;
}

function pointInRing(x: number, y: number, o: RingPre): boolean {
  const insideOuter = pointInEllipse({
    x,
    y,
    dx: o.dx,
    dy: o.dy,
    cosA: o.cosA,
    sinA: o.sinA,
    invRx2: o.invOuterRx2,
    invRy2: o.invOuterRy2,
  });
  if (!insideOuter) return false;

  if (o.invInnerRx2 === undefined || o.invInnerRy2 === undefined) return true;
  return !pointInEllipse({
    x,
    y,
    dx: o.dx,
    dy: o.dy,
    cosA: o.cosA,
    sinA: o.sinA,
    invRx2: o.invInnerRx2,
    invRy2: o.invInnerRy2,
    inclusive: true,
  });
}

/**
 * Compute the fraction of light blocked at a point by all precomputed occulters.
 * Returns a value in [0, 1] where 0 = fully unblocked, 1 = fully blocked.
 *
 * For circles and ellipses, opacity is always 1 (fully opaque).
 * For rings, the configurable opacity is applied.
 *
 * Multiple occulters are combined: we track the maximum blocked fraction
 * (overlapping opaque occulters don't double-block).
 */
export function pointOccultedFraction(x: number, y: number, occ: OcculterPre[]): number {
  let transparencyProduct = 1;

  for (const o of occ) {
    if (o.kind === "circle") {
      const dx = x - o.dx;
      const dy = y - o.dy;
      if (dx * dx + dy * dy < o.r2) return 1; // fully opaque, short-circuit
      continue;
    }

    if (o.kind === "ellipse") {
      if (
        pointInEllipse({
          x,
          y,
          dx: o.dx,
          dy: o.dy,
          cosA: o.cosA,
          sinA: o.sinA,
          invRx2: o.invRx2,
          invRy2: o.invRy2,
        })
      )
        return 1;
      continue;
    }

    // Ring: inside outer AND outside inner (inner boundary is treated as unblocked).
    if (pointInRing(x, y, o)) {
      if (o.opacity >= 1) return 1; // fully opaque, short-circuit
      transparencyProduct *= 1 - o.opacity;
    }
  }

  return 1 - transparencyProduct;
}

/**
 * Point-in-any-occulter test for precomputed shapes.
 * Returns true if the point is fully blocked by any opaque occulter.
 * For semi-transparent rings, use pointOccultedFraction instead.
 */
export function isPointOcculted(x: number, y: number, occ: OcculterPre[]): boolean {
  return pointOccultedFraction(x, y, occ) >= 1;
}
