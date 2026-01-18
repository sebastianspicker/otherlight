// src/experimental/physics/projectionShapes.ts
//
// Utilities for projecting simple non-spherical body/ring geometries into the observer sky plane.
//
// This module is intentionally projection-only: it converts 3D orientation into 2D ellipse params.
// It MUST NOT duplicate overlap/integral logic that belongs in photometry modules.

import type { Vec3 } from "../../physics/vec3";
import { vCross, vDot, vIsFinite, vLen, vNormalizeOrThrow } from "../../physics/vec3";

import type { SkyBasis } from "../../physics/frames";
import { buildSkyBasis } from "../../physics/frames";

import { clamp, wrapToPi } from "../../core/units";

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

function hypot2(x: number, y: number): number {
  return Math.hypot(x, y);
}

function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

/** Project a 3D vector into sky-plane coordinates using a basis. */
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
 * If rx < ry, swap and rotate angle by +pi/2 to keep the same geometric ellipse.
 * Angle is wrapped to (-π, π] for stability in UI/plotting.
 */
export function normalizeEllipse(rx: number, ry: number, angle: number): ProjectedEllipse {
  if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx < 0 || ry < 0) return { rx: NaN, ry: NaN, angle: NaN };

  const a = Number.isFinite(angle) ? angle : 0;

  // Allow degenerate ellipse (point) for robustness.
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
 * - spinAxis: body symmetry axis in inertial coordinates (need not be unit; will be normalized)
 * - observerDir: observer direction (from star to observer)
 *
 * Output: ProjectedEllipse with rx>=ry.
 *
 * Geometry:
 * - One projected semi-axis is always a (equatorial radius).
 * - The other is sqrt(a^2 sin^2 i + c^2 cos^2 i), where i is the angle between spin axis and LOS.
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
    // Pole-on => circle.
    return normalizeEllipse(A, A, 0);
  }

  const ang = skyAngleOfVector(u, basis);
  return normalizeEllipse(A, B, Number.isFinite(ang) ? ang : 0);
}

/**
 * Project a thin circular ring to a sky-plane ellipse.
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
    // Degenerate normal: render as circle.
    return { rx: r, ry: r, angle: 0 };
  }

  const cosI = Math.abs(clamp(vDot(nHat, ez), -1, 1));

  const rx = r;
  const ry = r * cosI;

  const u = vCross(ez, nHat);
  const uLen = vLen(u);
  if (!Number.isFinite(uLen) || uLen <= EPS) {
    // Face-on ring => circle.
    return normalizeEllipse(rx, rx, 0);
  }

  const ang = skyAngleOfVector(u, basis);
  return normalizeEllipse(rx, ry, Number.isFinite(ang) ? ang : 0);
}

/** Project a thin circular annulus (ring system) to sky-plane inner/outer ellipses. */
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

  // Share a basis for consistent angle outputs.
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
