// src/photometry/occulterShapes.ts
//
// Generalized 2D occulter silhouettes in the sky plane (projected plane of the star).
//
// Key repo-consistency goals (single-source & matching integrators)
// ---------------------------------------------------------------
// The existing transit integrators implement "blocked if inside ANY occulter" (union logic) using
// midpoint sampling on chords within the stellar disk. 
//
// To prevent divergence across modules:
// - This file becomes the single source of truth for *hit-testing* (circle/ellipse/ring) and union-hit.
// - Circle–circle overlap area (analytic) is *not* implemented here; mutualEvents keeps it for
//   visible-fraction geometry, and circle-only fluxUniformDisk keeps its fast analytic path. 
//
// Tangency policy (must match numeric integration expectations)
// ------------------------------------------------------------
// Midpoint integration samples a finite set of interior points. Tangency is measure-zero and should not
// introduce flicker; the integrators already treat tangency as "no overlap" in quick-reject paths
// via >= comparisons. 
//
// Therefore this module uses *strict* interior tests (< 1) for circle/ellipse inclusion, and for rings:
// - inside outer uses < 1
// - outside inner uses > 1
// This matches the integrators’ "tangent is measure-zero" philosophy. 
//
// Performance policy
// ------------------
// - Provide precomputed/cached representations for ellipse/ring to avoid repeated trig in inner loops.
// - Provide conservative bounding radius for cheap early reject.
// - Keep functions pure and deterministic.

import { clamp } from "../core/units"; // keep numeric helpers consistent across photometry 

/** A small numerical epsilon used for safe comparisons. */
const EPS = 1e-15;

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

function sq(x: number): number {
  return x * x;
}

/** Normalize an angle-like input; non-finite => 0. */
function safeAngle(a: unknown): number {
  return typeof a === "number" && Number.isFinite(a) ? a : 0;
}

/**
 * Base fields shared by all occulter shapes.
 * - (dx,dy) is center offset in sky coordinates.
 * - z is optional "depth" along observer direction (larger z = closer to observer),
 *   useful for sorting/diagnostics; not used in hit-testing.
 */
export type OcculterBase = {
  dx: number;
  dy: number;
  z?: number;
};

/**
 * Circular occulter (legacy).
 * This corresponds to a spherical body projected as a circle in the sky plane.
 */
export type CircleOcculter = OcculterBase & {
  kind: "circle";
  r: number;
};

/**
 * Elliptical occulter.
 * Semi-axes are rx, ry (>0). angle rotates local +x' relative to sky +x.
 */
export type EllipseOcculter = OcculterBase & {
  kind: "ellipse";
  rx: number;
  ry: number;
  angle?: number; // default 0
};

/**
 * Ring system occulter as an opaque annulus.
 * Blocked region: inside outer ellipse AND outside inner ellipse.
 */
export type RingOcculter = OcculterBase & {
  kind: "ring";
  rxOuter: number;
  ryOuter: number;
  rxInner?: number;
  ryInner?: number;
  angle?: number; // default 0
};

export type OcculterShape = CircleOcculter | EllipseOcculter | RingOcculter;

/**
 * A precomputed ellipse (or ring) frame for fast point tests.
 * We store rotation of -angle (to map sky -> local frame) and inverse squared axes.
 */
type EllipseFrame = {
  cosA: number;
  sinA: number;
  invRx2: number;
  invRy2: number;
};

function buildEllipseFrame(rx: number, ry: number, angle: number): EllipseFrame {
  // caller ensures rx,ry finite positive
  const a = safeAngle(angle);
  // We rotate by -a: (u,v) = R(-a) * (dx,dy)
  // cos(-a)=cos(a), sin(-a)=-sin(a)
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    cosA: c,
    sinA: -s,
    invRx2: 1 / (rx * rx),
    invRy2: 1 / (ry * ry),
  };
}

function rotateIntoFrame(dx: number, dy: number, f: EllipseFrame): { u: number; v: number } {
  // [u]   [ cosA  -sinA'] [dx] but we stored sinA = sin(-a) = -sin(a)
  // [v] = [ sinA   cosA ] [dy]
  const u = f.cosA * dx - f.sinA * dy;
  const v = f.sinA * dx + f.cosA * dy;
  return { u, v };
}

/**
 * Conservative sky-plane bounding radius for a shape (used for cheap early reject).
 * Returns NaN if the shape is invalid.
 */
export function occulterBoundingRadius(occ: OcculterShape): number {
  if (!occ || !isFiniteNumber(occ.dx) || !isFiniteNumber(occ.dy)) return NaN;

  switch (occ.kind) {
    case "circle": {
      if (!isFinitePositive(occ.r)) return NaN;
      return occ.r;
    }
    case "ellipse": {
      if (!isFinitePositive(occ.rx) || !isFinitePositive(occ.ry)) return NaN;
      return Math.max(occ.rx, occ.ry);
    }
    case "ring": {
      if (!isFinitePositive(occ.rxOuter) || !isFinitePositive(occ.ryOuter)) return NaN;
      return Math.max(occ.rxOuter, occ.ryOuter);
    }
    default: {
      const _exhaustive: never = occ;
      return NaN;
    }
  }
}

/**
 * Test whether point (x,y) is inside a circle centered at (dx,dy) with radius r.
 * Strict `<` for tangency measure-zero consistency with transit integrators. 
 */
export function isPointInCircle(x: number, y: number, occ: { dx: number; dy: number; r: number }): boolean {
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return false;
  if (!isFiniteNumber(occ.dx) || !isFiniteNumber(occ.dy)) return false;
  if (!isFinitePositive(occ.r)) return false;

  const u = x - occ.dx;
  const v = y - occ.dy;
  return u * u + v * v < occ.r * occ.r;
}

/**
 * Test whether point (x,y) is inside an ellipse defined by center (dx,dy), semi-axes (rx,ry),
 * and rotation angle.
 *
 * Uses strict `< 1` for tangency measure-zero consistency. 
 */
export function isPointInEllipse(
  x: number,
  y: number,
  occ: { dx: number; dy: number; rx: number; ry: number; angle?: number }
): boolean {
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return false;
  if (!isFiniteNumber(occ.dx) || !isFiniteNumber(occ.dy)) return false;
  if (!isFinitePositive(occ.rx) || !isFinitePositive(occ.ry)) return false;

  const f = buildEllipseFrame(occ.rx, occ.ry, safeAngle(occ.angle));
  const { u, v } = rotateIntoFrame(x - occ.dx, y - occ.dy, f);
  const q = u * u * f.invRx2 + v * v * f.invRy2;
  return q < 1;
}

/**
 * Test whether point (x,y) lies inside an opaque ring silhouette (annulus).
 * Blocked region: inside outer AND outside inner.
 *
 * Tangency policy:
 * - on outer boundary: not blocked (strict < 1 required)
 * - on inner boundary: not blocked (strict > 1 required)
 * This avoids boundary jitter and matches the integrators' tangency philosophy. 
 */
export function isPointInRing(
  x: number,
  y: number,
  occ: {
    dx: number;
    dy: number;
    rxOuter: number;
    ryOuter: number;
    rxInner?: number;
    ryInner?: number;
    angle?: number;
  }
): boolean {
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return false;
  if (!isFiniteNumber(occ.dx) || !isFiniteNumber(occ.dy)) return false;

  if (!isFinitePositive(occ.rxOuter) || !isFinitePositive(occ.ryOuter)) return false;

  const angle = safeAngle(occ.angle);

  const fOuter = buildEllipseFrame(occ.rxOuter, occ.ryOuter, angle);
  const { u, v } = rotateIntoFrame(x - occ.dx, y - occ.dy, fOuter);

  const qOuter = u * u * fOuter.invRx2 + v * v * fOuter.invRy2;
  if (!(qOuter < 1)) return false;

  // Hole radii default to 0 (filled disk).
  const rxI = isFiniteNumber(occ.rxInner) ? Math.max(0, occ.rxInner) : 0;
  const ryI = isFiniteNumber(occ.ryInner) ? Math.max(0, occ.ryInner) : 0;

  // If either inner axis is ~0, treat as no hole.
  if (rxI <= EPS || ryI <= EPS) return true;

  // If inner ellipse is not strictly inside outer, treat as non-blocking fail-safe.
  // (Better than accidentally blocking huge regions with invalid params.)
  if (rxI >= occ.rxOuter || ryI >= occ.ryOuter) return false;

  const fInner = buildEllipseFrame(rxI, ryI, angle);
  // We can reuse u,v because both frames use the same angle; only axes differ.
  const qInner = u * u * fInner.invRx2 + v * v * fInner.invRy2;

  return qInner > 1;
}

/**
 * General hit-test for an occulter silhouette.
 * Returns true if the point is blocked by the occulter.
 */
export function isPointBlockedByOcculter(x: number, y: number, occ: OcculterShape): boolean {
  if (!occ) return false;

  switch (occ.kind) {
    case "circle":
      return isPointInCircle(x, y, occ);
    case "ellipse":
      return isPointInEllipse(x, y, occ);
    case "ring":
      return isPointInRing(x, y, occ);
    default: {
      const _exhaustive: never = occ;
      return false;
    }
  }
}

/**
 * Union hit-test: returns true if (x,y) is blocked by any occulter in the list.
 *
 * IMPORTANT: This function’s semantics are the same as the integrators’ inner loops:
 * "blocked if inside ANY occulter" (union). 
 */
export function isPointBlockedByAnyOcculter(x: number, y: number, occulters: OcculterShape[]): boolean {
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return false;
  if (!Array.isArray(occulters) || occulters.length === 0) return false;

  for (const occ of occulters) {
    if (!occ) continue;

    // Cheap bounding-circle reject (skip if invalid).
    const br = occulterBoundingRadius(occ);
    if (Number.isFinite(br)) {
      const dx = x - occ.dx;
      const dy = y - occ.dy;
      if (dx * dx + dy * dy > br * br) continue;
    }

    if (isPointBlockedByOcculter(x, y, occ)) return true;
  }

  return false;
}

/**
 * Sanitize occulters for use with star-disk integrators.
 *
 * Matches the integrators' "tangent is measure-zero" convention by using >= in the reject. 
 * For non-circular shapes, we use a conservative bounding radius to cheaply reject shapes that cannot overlap.
 */
export function sanitizeOccultersForStarDisk(rStar: number, occulters: OcculterShape[]): OcculterShape[] {
  const out: OcculterShape[] = [];
  if (!isFinitePositive(rStar)) return out;
  if (!Array.isArray(occulters) || occulters.length === 0) return out;

  for (const occ of occulters) {
    if (!occ) continue;
    if (!isFiniteNumber(occ.dx) || !isFiniteNumber(occ.dy)) continue;

    const br = occulterBoundingRadius(occ);
    if (!Number.isFinite(br) || !(br > 0)) continue;

    const d = Math.hypot(occ.dx, occ.dy);
    if (!Number.isFinite(d)) continue;

    // If center distance is >= rStar + br, cannot overlap (tangent excluded).
    if (d >= rStar + br) continue;

    out.push(occ);
  }

  return out;
}

/**
 * Backwards-compat convenience: convert legacy circle occulter representation to OcculterShape.
 */
export function circleOcculter(dx: number, dy: number, r: number, z?: number): CircleOcculter {
  return { kind: "circle", dx, dy, r, z };
}

export function ellipseOcculter(dx: number, dy: number, rx: number, ry: number, angle = 0, z?: number): EllipseOcculter {
  return { kind: "ellipse", dx, dy, rx, ry, angle, z };
}

export function ringOcculter(
  dx: number,
  dy: number,
  rxOuter: number,
  ryOuter: number,
  rxInner: number,
  ryInner: number,
  angle = 0,
  z?: number
): RingOcculter {
  return { kind: "ring", dx, dy, rxOuter, ryOuter, rxInner, ryInner, angle, z };
}

/**
 * Optional compatibility helpers for "single source" overlap/geometry across modules
 * -------------------------------------------------------------------------------
 * transitUniform currently has its own circleIntersectionArea implementation. 
 * mutualEvents also has circleIntersectionArea (exported). 
 *
 * To prevent further divergence going forward, provide an exported alias to the canonical
 * circleIntersectionArea in mutualEvents (import it there when refactoring transitUniform).
 *
 * NOTE: This file itself does not re-implement circleIntersectionArea to avoid a third copy.
 */
export { circleIntersectionArea } from "./mutualEvents";
export function couldOverlapStarOnSky(dx: number, dy: number, br: number, rStar: number): boolean {
  if (!isFiniteNumber(dx) || !isFiniteNumber(dy) || !isFinitePositive(br) || !isFinitePositive(rStar)) return false;
  // Tangency excluded, matching sanitizeOcculters logic in existing integrators. 
  return Math.hypot(dx, dy) < rStar + br;
}

/**
 * Small numeric helper used widely in photometry; re-export for gradual consolidation.
 */
export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}
