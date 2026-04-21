// src/photometry/occulterEllipse.ts
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

export function isCircleOcculter(o: OcculterShape): o is CircleOcculter {
  return !("kind" in o) || o.kind === undefined || o.kind === "circle";
}

export function isEllipseOcculter(o: OcculterShape): o is EllipseOcculter {
  return "kind" in o && o.kind === "ellipse";
}

export function isRingOcculter(o: OcculterShape): o is RingOcculter {
  return "kind" in o && o.kind === "ring";
}

function overlapsStarByRadius(dx: number, dy: number, rOccMax: number, rStar: number): boolean {
  if (!isFinitePositive(rStar) || !isFinitePositive(rOccMax)) return false;
  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d)) return false;
  // Tangency is measure-zero: treat d >= rStar + rOccMax as no overlap.
  return d < rStar + rOccMax;
}

/**
 * Filter a mixed list of occulters for validity and potential overlap with the star.
 * Uses conservative bounding radii for non-circular shapes.
 */
export function sanitizeOcculterShapes(rStar: number, occulters?: readonly OcculterShape[]): OcculterShape[] {
  const out: OcculterShape[] = [];
  if (!isFinitePositive(rStar)) return out;
  if (!Array.isArray(occulters) || occulters.length === 0) return out;

  for (const o of occulters) {
    if (!o) continue;

    if (isCircleOcculter(o)) {
      if (!isFiniteNumber(o.dx) || !isFiniteNumber(o.dy) || !isFinitePositive(o.r)) continue;
      if (!overlapsStarByRadius(o.dx, o.dy, o.r, rStar)) continue;
      out.push(o);
      continue;
    }

    if (isEllipseOcculter(o)) {
      if (!isFiniteNumber(o.dx) || !isFiniteNumber(o.dy)) continue;
      if (!isFinitePositive(o.rx) || !isFinitePositive(o.ry)) continue;

      const rMax = Math.max(o.rx, o.ry);
      if (!overlapsStarByRadius(o.dx, o.dy, rMax, rStar)) continue;
      out.push(o);
      continue;
    }

    if (isRingOcculter(o)) {
      if (!isFiniteNumber(o.dx) || !isFiniteNumber(o.dy)) continue;
      if (!isFinitePositive(o.rOuter)) continue;
      const rInner = Number.isFinite(o.rInner) ? Math.max(0, o.rInner) : 0;
      if (!(o.rOuter > rInner)) continue;

      if (!overlapsStarByRadius(o.dx, o.dy, o.rOuter, rStar)) continue;
      out.push({
        ...o,
        rInner,
      });
    }
  }

  return out;
}

export type OcculterPre =
  | { kind: "circle"; dx: number; dy: number; r2: number }
  | { kind: "ellipse"; dx: number; dy: number; cosA: number; sinA: number; invRx2: number; invRy2: number }
  | {
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

/**
 * Precompute occulter coefficients for fast point-in-shape tests.
 */
export function precomputeOcculterShapes(occulters: OcculterShape[]): OcculterPre[] {
  const out: OcculterPre[] = [];
  if (!Array.isArray(occulters) || occulters.length === 0) return out;

  for (const o of occulters) {
    if (!o) continue;

    if (isCircleOcculter(o)) {
      if (!isFiniteNumber(o.dx) || !isFiniteNumber(o.dy) || !isFinitePositive(o.r)) continue;
      out.push({ kind: "circle", dx: o.dx, dy: o.dy, r2: o.r * o.r });
      continue;
    }

    if (isEllipseOcculter(o)) {
      if (!isFiniteNumber(o.dx) || !isFiniteNumber(o.dy)) continue;
      if (!isFinitePositive(o.rx) || !isFinitePositive(o.ry)) continue;

      const angleRaw = o.angle;
      const angle = typeof angleRaw === "number" && Number.isFinite(angleRaw) ? angleRaw : 0;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      out.push({
        kind: "ellipse",
        dx: o.dx,
        dy: o.dy,
        cosA,
        sinA,
        invRx2: 1 / (o.rx * o.rx),
        invRy2: 1 / (o.ry * o.ry),
      });
      continue;
    }

    if (isRingOcculter(o)) {
      if (!isFiniteNumber(o.dx) || !isFiniteNumber(o.dy)) continue;
      if (!isFinitePositive(o.rOuter)) continue;

      const rInnerRaw = o.rInner;
      const rInner = typeof rInnerRaw === "number" && Number.isFinite(rInnerRaw) ? Math.max(0, rInnerRaw) : 0;
      if (!(o.rOuter > rInner)) continue;

      const incRaw = o.inc;
      const inc = typeof incRaw === "number" && Number.isFinite(incRaw) ? incRaw : 0;
      const cosInc = Math.abs(Math.cos(inc));
      const outerRy = o.rOuter * cosInc;
      if (!(outerRy > 0)) continue; // edge-on -> zero area, ignore

      const innerRy = rInner * cosInc;
      const angleRaw = o.angle;
      const angle = typeof angleRaw === "number" && Number.isFinite(angleRaw) ? angleRaw : 0;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const rawOpacity = o.opacity;
      const opacity =
        typeof rawOpacity === "number" && Number.isFinite(rawOpacity)
          ? Math.max(0, Math.min(1, rawOpacity))
          : 1;

      out.push({
        kind: "ring",
        dx: o.dx,
        dy: o.dy,
        cosA,
        sinA,
        invOuterRx2: 1 / (o.rOuter * o.rOuter),
        invOuterRy2: 1 / (outerRy * outerRy),
        invInnerRx2: rInner > 0 ? 1 / (rInner * rInner) : undefined,
        invInnerRy2: rInner > 0 && innerRy > 0 ? 1 / (innerRy * innerRy) : undefined,
        opacity,
      });
    }
  }

  return out;
}

function pointInEllipse(
  x: number,
  y: number,
  dx: number,
  dy: number,
  cosA: number,
  sinA: number,
  invRx2: number,
  invRy2: number,
  inclusive = false,
): boolean {
  const xp = x - dx;
  const yp = y - dy;
  const xr = xp * cosA + yp * sinA;
  const yr = -xp * sinA + yp * cosA;
  const v = xr * xr * invRx2 + yr * yr * invRy2;
  return inclusive ? v <= 1 : v < 1;
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
      if (pointInEllipse(x, y, o.dx, o.dy, o.cosA, o.sinA, o.invRx2, o.invRy2, false)) return 1;
      continue;
    }

    // Ring: inside outer AND outside inner (inner boundary is treated as unblocked).
    const insideOuter = pointInEllipse(x, y, o.dx, o.dy, o.cosA, o.sinA, o.invOuterRx2, o.invOuterRy2, false);
    if (!insideOuter) continue;

    let inRing = true;
    if (o.invInnerRx2 !== undefined && o.invInnerRy2 !== undefined) {
      const insideInner = pointInEllipse(
        x,
        y,
        o.dx,
        o.dy,
        o.cosA,
        o.sinA,
        o.invInnerRx2,
        o.invInnerRy2,
        true,
      );
      if (insideInner) inRing = false;
    }

    if (inRing) {
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
