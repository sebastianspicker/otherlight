// src/photometry/patches.ts
//
// Shared helpers for projected brightness patches (spots/faculae).
//
// Purpose:
// - Deduplicate patch sanitization + point-in-patch + combination policy across photometry integrators.
// - Keep behavior deterministic and robust.
//
// Scientific / modeling note:
// - Patches are 2D masks painted on the projected stellar disk (sky plane).
// - The returned factor multiplies the local specific intensity.

import type { BrightnessPatch } from "../core/types";

export type PatchCombineMode = "multiply" | "max" | "overrideLast";

type PatchPreCircle = {
  kind: "circle";
  x: number;
  y: number;
  factor: number;
  r2: number;
};

type PatchPreEllipse = {
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

function isFinitePositive(x: number): boolean {
  return Number.isFinite(x) && x > 0;
}

/**
 * Sanitize patches into a precomputed representation.
 * - Drops invalid entries.
 * - Clamps factor to >= 0 (negative intensity is unphysical).
 */
export function sanitizeBrightnessPatches(patches: BrightnessPatch[] | undefined): PatchPre[] {
  const out: PatchPre[] = [];
  for (const p of patches ?? []) {
    if (!p) continue;

    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.factor)) continue;
    const factor = Math.max(0, p.factor);

    if (p.shape === "circle") {
      const r = p.r ?? NaN;
      if (!isFinitePositive(r)) continue;
      out.push({ kind: "circle", x: p.x, y: p.y, factor, r2: r * r });
      continue;
    }

    if (p.shape === "ellipse") {
      const rx = p.rx ?? NaN;
      const ry = p.ry ?? NaN;
      if (!isFinitePositive(rx) || !isFinitePositive(ry)) continue;

      const angle = Number.isFinite(p.angle) ? (p.angle as number) : 0;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      out.push({
        kind: "ellipse",
        x: p.x,
        y: p.y,
        factor,
        invRx2: 1 / (rx * rx),
        invRy2: 1 / (ry * ry),
        cosA,
        sinA,
      });
      continue;
    }
  }
  return out;
}

/** Test if point (x,y) lies inside a precomputed patch. */
export function pointInPatch(x: number, y: number, p: PatchPre): boolean {
  if (p.kind === "circle") {
    const dx = x - p.x;
    const dy = y - p.y;
    return dx * dx + dy * dy <= p.r2;
  }

  const dx = x - p.x;
  const dy = y - p.y;

  // Rotate into patch frame:
  const xp = p.cosA * dx + p.sinA * dy;
  const yp = -p.sinA * dx + p.cosA * dy;

  return xp * xp * p.invRx2 + yp * yp * p.invRy2 <= 1;
}

/**
 * Brightness factor at (x,y) for a set of patches.
 *
 * - "multiply": product of all containing patch factors.
 * - "max": maximum factor among containing patches.
 * - "overrideLast": last containing patch wins (painter's algorithm).
 */
export function patchFactorAt(x: number, y: number, patches: PatchPre[], mode: PatchCombineMode): number {
  if (patches.length === 0) return 1;

  if (mode === "overrideLast") {
    let f = 1;
    for (const p of patches) {
      if (pointInPatch(x, y, p)) f = p.factor;
    }
    return Number.isFinite(f) ? Math.max(0, f) : 1;
  }

  if (mode === "max") {
    let f = 1;
    for (const p of patches) {
      if (pointInPatch(x, y, p)) f = Math.max(f, p.factor);
    }
    return Number.isFinite(f) ? Math.max(0, f) : 1;
  }

  // mode === "multiply"
  let f = 1;
  for (const p of patches) {
    if (pointInPatch(x, y, p)) f *= p.factor;
  }
  return Number.isFinite(f) ? Math.max(0, f) : 1;
}
