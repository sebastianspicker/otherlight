// src/physics/projectionShapes.ts
//
// Utilities for projecting simple non-spherical body/ring geometries into the observer sky plane.
//
// Consolidation / duplication policy (important for this repo)
// -----------------------------------------------------------
// This module is intentionally "projection-only": it converts 3D orientation into 2D ellipse params.
// It MUST NOT become a second home for transit/photometry overlap integrals.
//
// In this codebase, robust circle overlap / circle intersection area / union-of-occulters logic already
// exists in photometry modules (e.g. photometry/transitUniform.ts and photometry/mutualEvents.ts).
// Likewise, ellipse-inclusion logic for brightness patches exists in photometry/transitUniformSpots.ts
// and photometry/transitLimbDarkened.ts.
//
// Therefore, this file:
// - keeps ONLY generic 3D→2D projection + ellipse normalization helpers,
// - avoids adding circle-overlap or ellipse-point-inclusion utilities here,
// - imports shared numeric helpers (clamp/wrap) from core/units instead of duplicating them locally.
//
// Scientific correctness notes (projection formulas)
// -------------------------------------------------
// Oblate spheroid (equatorial radius a, polar radius c) with symmetry axis ŝ, viewed along e_z:
// - The projected silhouette is an ellipse with semi-axes:
//     A = a
//     B = sqrt(a^2 sin^2(i) + c^2 cos^2(i))
//   where cos(i) = |ŝ · e_z|.
// - The ellipse major-axis direction in the sky plane aligns with u = e_z × ŝ
//   (perpendicular to the projected spin axis); if u is degenerate (pole-on), the ellipse is a circle.
//
// Thin circular ring of radius R in a plane with unit normal n̂:
// - Projection is an ellipse with semi-axes:
//     rx = R
//     ry = R * |n̂ · e_z|
// - Major axis direction aligns with u = e_z × n̂ (intersection of ring plane with sky plane).
//
// Coordinate conventions (consistent with src/physics/frames.ts)
// ------------------------------------------------------------
// observerDir points from the star toward the observer.
// Sky plane is perpendicular to observerDir.
// We build a right-handed sky basis {ex, ey, ez} with ez = normalized(observerDir).
// A 3D vector v has sky-plane components (vx,vy) = (dot(v,ex), dot(v,ey)) and depth vz = dot(v,ez).
//
// Output conventions
// ------------------
// - Ellipse parameters are expressed in sky-plane coordinates (center offset handled by caller).
// - angle is the rotation of the ellipse's major axis relative to sky +x (ex), in radians.
// - normalizeEllipse enforces rx >= ry >= 0 and wraps angle to (-π, π] for consistency.

import type { Vec3 } from "./vec3";
import { vCross, vDot, vLen, vNormalizeOrThrow, vIsFinite } from "./vec3";
import { clamp, wrapToPi } from "../core/units";

export type SkyBasis = {
  ex: Vec3;
  ey: Vec3;
  ez: Vec3;
};

export type ProjectedEllipse = {
  /** Semi-axis along the ellipse local x' (major axis after normalization). */
  rx: number;
  /** Semi-axis along the ellipse local y' (minor axis after normalization). */
  ry: number;
  /** Rotation angle of the ellipse major axis relative to sky +x (ex), radians. */
  angle: number;
};

/** Small numeric epsilon for safe normalization and comparisons. */
const EPS = 1e-15;

function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

function hypot2(x: number, y: number): number {
  return Math.hypot(x, y);
}

/**
 * Build an orthonormal right-handed sky basis from observerDir.
 *
 * Note on consolidation:
 * - frames.ts likely has similar functionality (projectToSky builds a basis internally).
 * - We keep this local to avoid circular deps and to keep this file usable in isolation.
 */
export function buildSkyBasis(observerDir: Vec3): SkyBasis {
  if (!vIsFinite(observerDir)) throw new Error("buildSkyBasis: observerDir must be finite.");
  const ez = vNormalizeOrThrow(observerDir, EPS, "buildSkyBasis: observerDir must be non-zero.");

  // Choose a reference not close to ez for stable cross products.
  const ref: Vec3 = Math.abs(ez.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };

  let ex = vCross(ref, ez);
  if (vLen(ex) < EPS) {
    // Extremely unlikely fallback if ref ~|| ez.
    ex = vCross({ x: 1, y: 0, z: 0 }, ez);
  }
  ex = vNormalizeOrThrow(ex, EPS, "buildSkyBasis: failed to build ex basis.");

  // Right-handed: ex × ey = ez  =>  ey = ez × ex
  const ey = vCross(ez, ex);
  return { ex, ey, ez };
}

/**
 * Project a 3D vector into sky-plane coordinates using a basis.
 */
export function projectToSkyXY(v: Vec3, basis: SkyBasis): { x: number; y: number } {
  return { x: vDot(v, basis.ex), y: vDot(v, basis.ey) };
}

/**
 * Compute the sky-plane direction angle of a 3D vector v, after projecting to the sky plane.
 * Returns angle in radians relative to sky +x (ex). If projection is degenerate, returns NaN.
 */
export function skyAngleOfVector(v: Vec3, basis: SkyBasis): number {
  if (!vIsFinite(v)) return NaN;

  const p = projectToSkyXY(v, basis);
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return NaN;

  const r = hypot2(p.x, p.y);
  if (!Number.isFinite(r) || r <= EPS) return NaN;

  return Math.atan2(p.y, p.x);
}

/**
 * Normalize an ellipse so that rx >= ry >= 0 and adjust angle accordingly.
 *
 * If rx < ry, swap and rotate angle by +pi/2 to keep the same geometric ellipse.
 * Angle is wrapped to (-π, π] for stability in UI/plotting.
 */
export function normalizeEllipse(rx: number, ry: number, angle: number): ProjectedEllipse {
  if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx < 0 || ry < 0) return { rx: NaN, ry: NaN, angle: NaN };

  const a = Number.isFinite(angle) ? angle : 0;

  if (rx + ry <= 0) return { rx: 0, ry: 0, angle: wrapToPi(a) };

  if (rx >= ry) return { rx, ry, angle: wrapToPi(a) };

  return { rx: ry, ry: rx, angle: wrapToPi(a + Math.PI / 2) };
}

/**
 * Project an axisymmetric oblate spheroid silhouette to the sky plane.
 *
 * Inputs:
 * - rEq: equatorial radius a (>0)
 * - rPol: polar radius c (>0)
 * - spinAxis: body symmetry axis in inertial coordinates (need not be unit; will be normalized).
 * - observerDir: observer direction (from star to observer).
 *
 * Output: ProjectedEllipse with rx>=ry.
 */
export function projectOblateSpheroidToSkyEllipse(params: {
  rEq: number;
  rPol: number;
  spinAxis: Vec3;
  observerDir: Vec3;
  basis?: SkyBasis;
}): ProjectedEllipse {
  const { rEq, rPol, spinAxis, observerDir } = params;

  if (!isFinitePositive(rEq) || !isFinitePositive(rPol)) return { rx: NaN, ry: NaN, angle: NaN };
  if (!vIsFinite(spinAxis) || !vIsFinite(observerDir)) return { rx: NaN, ry: NaN, angle: NaN };

  const basis = params.basis ?? buildSkyBasis(observerDir);
  const ez = basis.ez;

  let sHat: Vec3;
  try {
    sHat = vNormalizeOrThrow(spinAxis, EPS, "projectOblateSpheroidToSkyEllipse: spinAxis must be non-zero.");
  } catch {
    // Degenerate spin axis: treat as sphere of radius rEq for rendering robustness.
    return { rx: rEq, ry: rEq, angle: 0 };
  }

  // cos(i) = |s · ez|
  const cosI = Math.abs(clamp(vDot(sHat, ez), -1, 1));
  const sinI = Math.sqrt(Math.max(0, 1 - cosI * cosI));

  // Semi-axes: A=a, B=sqrt(a^2 sin^2 i + c^2 cos^2 i)
  const A = rEq;
  const B = Math.sqrt(Math.max(0, rEq * rEq * sinI * sinI + rPol * rPol * cosI * cosI));

  // Major-axis direction u = ez × sHat (degenerate if pole-on).
  const u = vCross(ez, sHat);
  const uLen = vLen(u);

  if (!Number.isFinite(uLen) || uLen <= EPS) {
    return normalizeEllipse(A, A, 0);
  }

  const angle = skyAngleOfVector(u, basis);
  return normalizeEllipse(A, B, Number.isFinite(angle) ? angle : 0);
}

/**
 * Project a thin circular ring to a sky-plane ellipse.
 *
 * Inputs:
 * - r: ring radius (>0)
 * - ringNormal: ring plane normal in inertial coordinates (need not be unit; will be normalized).
 * - observerDir: observer direction (from star to observer).
 *
 * Output:
 * - rx = r
 * - ry = r * |cos(i)|, cos(i)=|n̂·ez|
 * - angle aligned with u = ez × n̂
 */
export function projectCircularRingToSkyEllipse(params: {
  r: number;
  ringNormal: Vec3;
  observerDir: Vec3;
  basis?: SkyBasis;
}): ProjectedEllipse {
  const { r, ringNormal, observerDir } = params;

  if (!isFinitePositive(r)) return { rx: NaN, ry: NaN, angle: NaN };
  if (!vIsFinite(ringNormal) || !vIsFinite(observerDir)) return { rx: NaN, ry: NaN, angle: NaN };

  const basis = params.basis ?? buildSkyBasis(observerDir);
  const ez = basis.ez;

  let nHat: Vec3;
  try {
    nHat = vNormalizeOrThrow(ringNormal, EPS, "projectCircularRingToSkyEllipse: ringNormal must be non-zero.");
  } catch {
    return { rx: r, ry: r, angle: 0 };
  }

  const cosI = Math.abs(clamp(vDot(nHat, ez), -1, 1));
  const rx = r;
  const ry = r * cosI;

  const u = vCross(ez, nHat);
  const uLen = vLen(u);

  if (!Number.isFinite(uLen) || uLen <= EPS) {
    return normalizeEllipse(rx, rx, 0);
  }

  const angle = skyAngleOfVector(u, basis);
  return normalizeEllipse(rx, ry, Number.isFinite(angle) ? angle : 0);
}

/**
 * Project a thin circular annulus (ring system) to sky-plane inner/outer ellipses.
 */
export function projectCircularAnnulusToSkyEllipses(params: {
  rInner: number;
  rOuter: number;
  ringNormal: Vec3;
  observerDir: Vec3;
  basis?: SkyBasis;
}): { inner: ProjectedEllipse; outer: ProjectedEllipse } {
  const { rInner, rOuter, ringNormal, observerDir } = params;

  if (!isFinitePositive(rOuter)) {
    return {
      inner: { rx: NaN, ry: NaN, angle: NaN },
      outer: { rx: NaN, ry: NaN, angle: NaN },
    };
  }

  const innerR = typeof rInner === "number" && Number.isFinite(rInner) ? Math.max(0, rInner) : 0;
  const basis = params.basis ?? buildSkyBasis(observerDir);

  const outer = projectCircularRingToSkyEllipse({ r: rOuter, ringNormal, observerDir, basis });

  if (!(innerR > 0)) {
    // Degenerate: no hole.
    return { inner: { rx: 0, ry: 0, angle: outer.angle }, outer };
  }

  const inner = projectCircularRingToSkyEllipse({ r: innerR, ringNormal, observerDir, basis });

  // Analytically the angles match; force for stable rendering/masking.
  return { inner: { rx: inner.rx, ry: inner.ry, angle: outer.angle }, outer };
}
