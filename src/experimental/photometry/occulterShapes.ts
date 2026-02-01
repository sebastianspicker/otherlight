// src/experimental/photometry/occulterShapes.ts
//
// Generalized 2D occulter silhouettes in the sky plane (projected plane of the star).
//
// Key goals
// - Single source of truth for shape hit-testing (circle/ellipse/ring) and union-hit.
// - Tangency is measure-zero; use strict interior tests (< / >) so boundaries do not cause flicker.
// - Pure, deterministic helpers with robust NaN/Inf guards.

import { clamp } from "../../core/units";

/* ------------------------------------------------------------------------------------------------
 * (b) OPTIONAL RE-EXPORTS (Transit-circle contract)
 * ------------------------------------------------------------------------------------------------
 * These are the canonical circle occulter types/helpers used by the transit integrators.
 * They are re-exported here under disambiguated names to avoid collisions with the local shape types.
 */
export type { CircleOcculter as TransitCircleOcculter } from "../../photometry/occulterCircle";

/* ------------------------------------------------------------------------------------------------
 * (a) LOCAL SHAPE TYPES (tagged unions for generic silhouettes)
 * ------------------------------------------------------------------------------------------------ */

const EPS = 1e-15;

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

/** Normalize an angle-like input; non-finite => 0. */
function safeAngle(a: unknown): number {
  return isFiniteNumber(a) ? a : 0;
}

/**
 * Base fields shared by all occulter shapes.
 * - (dx,dy) is center offset in sky coordinates.
 * - z is optional depth along observer direction (larger z = closer to observer).
 *   Not used in hit-testing here; kept for sorting/diagnostics elsewhere.
 */
export type OcculterBase = {
  dx: number;
  dy: number;
  z?: number;
};

/** Circular occulter silhouette (tagged union via kind). */
export type ShapeCircleOcculter = OcculterBase & {
  kind: "circle";
  r: number;
};

/** Elliptical occulter. Semi-axes rx, ry (>0). angle rotates local +x' relative to sky +x. */
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

  /**
   * Ring degeneration policy.
   *
   * If true (default), a degenerate inner ellipse (rxInner≈0 or ryInner≈0) disables the hole
   * and the ring behaves like a filled disk (outer ellipse only).
   *
   * If set to false, a degenerate inner ellipse makes the ring invalid and it blocks nothing (fail-safe).
   *
   * Rationale: avoid surprising "degenerate line" behavior in hit-testing and keep the simulation stable.
   */
  holeDisabledIfDegenerate?: boolean;
};

export type OcculterShape = ShapeCircleOcculter | EllipseOcculter | RingOcculter;

/* ------------------------------------------------------------------------------------------------
 * Geometry primitives (fast, deterministic, strict tangency policy)
 * ------------------------------------------------------------------------------------------------ */

type EllipseFrame = {
  cosA: number;
  sinA: number; // sin(-a)
  invRx2: number;
  invRy2: number;
};

function buildEllipseFrame(rx: number, ry: number, angle: number): EllipseFrame {
  const a = safeAngle(angle);
  const c = Math.cos(a);
  const s = Math.sin(a);

  return {
    cosA: c,
    sinA: -s, // -sin(a) = sin(-a)
    invRx2: 1 / (rx * rx),
    invRy2: 1 / (ry * ry),
  };
}

function rotateIntoFrame(dx: number, dy: number, f: EllipseFrame): { u: number; v: number } {
  // Rotate by -a:
  // u = cos(a)*dx + sin(a)*dy  (because sin(-a)=-sin(a) stored in f.sinA)
  // v = -sin(a)*dx + cos(a)*dy
  const u = f.cosA * dx - f.sinA * dy;
  const v = f.sinA * dx + f.cosA * dy;
  return { u, v };
}

/**
 * Conservative sky-plane bounding radius for a shape (cheap early reject).
 * Returns NaN if the shape is invalid.
 */
export function occulterBoundingRadius(occ: OcculterShape): number {
  if (!occ || !isFiniteNumber(occ.dx) || !isFiniteNumber(occ.dy)) return Number.NaN;

  switch (occ.kind) {
    case "circle": {
      return isFinitePositive(occ.r) ? occ.r : Number.NaN;
    }
    case "ellipse": {
      if (!isFinitePositive(occ.rx) || !isFinitePositive(occ.ry)) return Number.NaN;
      return Math.max(occ.rx, occ.ry);
    }
    case "ring": {
      if (!isFinitePositive(occ.rxOuter) || !isFinitePositive(occ.ryOuter)) return Number.NaN;
      return Math.max(occ.rxOuter, occ.ryOuter);
    }
    default: {
      const _exhaustive: never = occ;
      return _exhaustive;
    }
  }
}

/** Strict point-in-circle test (tangency excluded). */
export function isPointInCircle(x: number, y: number, occ: { dx: number; dy: number; r: number }): boolean {
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return false;
  if (!isFiniteNumber(occ.dx) || !isFiniteNumber(occ.dy)) return false;
  if (!isFinitePositive(occ.r)) return false;

  const u = x - occ.dx;
  const v = y - occ.dy;
  return u * u + v * v < occ.r * occ.r;
}

/** Strict point-in-ellipse test (tangency excluded). */
export function isPointInEllipse(
  x: number,
  y: number,
  occ: { dx: number; dy: number; rx: number; ry: number; angle?: number },
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
 * Strict point-in-ring test (annulus).
 * Blocked region: inside outer AND outside inner.
 *
 * Ring degeneration policy:
 * - If rxInner or ryInner is ~0, the inner "hole" is treated as disabled (filled disk) by default.
 * - Set `holeDisabledIfDegenerate: false` to instead treat a degenerate inner ellipse as invalid (no blocking).
 * - For a valid ring with a hole, the inner ellipse must lie strictly inside the outer ellipse; otherwise invalid => no blocking.
 *
 * Tangency policy:
 * - outer boundary: not blocked (requires qOuter < 1)
 * - inner boundary: not blocked (requires qInner > 1)
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
    holeDisabledIfDegenerate?: boolean;
  },
): boolean {
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return false;
  if (!isFiniteNumber(occ.dx) || !isFiniteNumber(occ.dy)) return false;
  if (!isFinitePositive(occ.rxOuter) || !isFinitePositive(occ.ryOuter)) return false;

  const angle = safeAngle(occ.angle);
  const fOuter = buildEllipseFrame(occ.rxOuter, occ.ryOuter, angle);

  const { u, v } = rotateIntoFrame(x - occ.dx, y - occ.dy, fOuter);
  const qOuter = u * u * fOuter.invRx2 + v * v * fOuter.invRy2;

  if (!(qOuter < 1)) return false;

  // Hole radii default to 0 (filled disk unless a non-degenerate inner ellipse is provided).
  const rxI = isFiniteNumber(occ.rxInner) ? Math.max(0, occ.rxInner) : 0;
  const ryI = isFiniteNumber(occ.ryInner) ? Math.max(0, occ.ryInner) : 0;

  // Degenerate inner ellipse: by default we disable the hole and treat the ring as a filled disk.
  // This avoids surprising "degenerate line" geometry in hit-testing.
  const holeDisabledIfDegenerate = occ.holeDisabledIfDegenerate !== false;

  if (rxI <= EPS || ryI <= EPS) {
    return holeDisabledIfDegenerate ? true : false;
  }

  // Fail-safe: inner must lie *strictly* inside outer, otherwise this is considered an invalid ring
  // and blocks nothing (safe default for rendering/simulation).
  if (rxI >= occ.rxOuter || ryI >= occ.ryOuter) return false;

  const invRxI2 = 1 / (rxI * rxI);
  const invRyI2 = 1 / (ryI * ryI);
  const qInner = u * u * invRxI2 + v * v * invRyI2;

  return qInner > 1;
}

/** General hit-test: returns true if (x,y) is blocked by the occulter silhouette. */
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
      return _exhaustive;
    }
  }
}

/**
 * Union hit-test: returns true if (x,y) is blocked by any occulter in the list.
 * Semantics: blocked if inside ANY silhouette (union).
 */
export function isPointBlockedByAnyOcculter(
  x: number,
  y: number,
  occulters: readonly OcculterShape[],
): boolean {
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return false;
  if (!Array.isArray(occulters) || occulters.length === 0) return false;

  for (const occ of occulters) {
    if (!occ) continue;

    // Cheap bounding-radius reject.
    const br = occulterBoundingRadius(occ);
    if (Number.isFinite(br) && br > 0) {
      const dx = x - occ.dx;
      const dy = y - occ.dy;
      // Use bounding circle check: if point is outside bounding circle, it's outside shape.
      // Strict inequality: point outside br*br -> definitely not blocked.
      if (dx * dx + dy * dy >= br * br) continue;
    }

    if (isPointBlockedByOcculter(x, y, occ)) return true;
  }

  return false;
}

/**
 * Sanitize occulters for use with star-disk integrators.
 * Tangency excluded: if center distance is >= rStar + br, cannot overlap.
 */
export function sanitizeOccultersForStarDisk(
  rStar: number,
  occulters: readonly OcculterShape[],
): OcculterShape[] {
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

    // Tangency excluded to match measure-zero policy.
    if (d >= rStar + br) continue;

    out.push(occ);
  }

  return out;
}

/** Convenience constructors. */
export function circleOcculter(dx: number, dy: number, r: number, z?: number): ShapeCircleOcculter {
  return { kind: "circle", dx, dy, r, z };
}

export function ellipseOcculter(
  dx: number,
  dy: number,
  rx: number,
  ry: number,
  angle = 0,
  z?: number,
): EllipseOcculter {
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
  z?: number,
): RingOcculter {
  return { kind: "ring", dx, dy, rxOuter, ryOuter, rxInner, ryInner, angle, z };
}

/* ------------------------------------------------------------------------------------------------
 * Optional convenience re-exports (kept separate to avoid name collisions)
 * ------------------------------------------------------------------------------------------------ */

/**
 * Compatibility helper: canonical circle intersection area lives in mutualEvents.ts.
 * Re-exported here to avoid a third copy elsewhere.
 */
export { circleIntersectionArea } from "../../photometry/mutualEvents";

/** Cheap overlap predicate used in several modules. */
export function couldOverlapStarOnSky(dx: number, dy: number, br: number, rStar: number): boolean {
  if (!isFiniteNumber(dx) || !isFiniteNumber(dy)) return false;
  if (!isFinitePositive(br) || !isFinitePositive(rStar)) return false;
  return Math.hypot(dx, dy) < rStar + br; // strict: tangency excluded
}

/** Small numeric helper used widely in photometry. */
export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}
