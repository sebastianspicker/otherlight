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

    // Unknown/unsupported shape => drop.
    continue;
  }

  return out;
}

/** Test if point (x,y) lies inside a precomputed patch. */
export function pointInPatch(x: number, y: number, p: PatchPre): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

  if (p.kind === "circle") {
    const dx = x - p.x;
    const dy = y - p.y;
    return dx * dx + dy * dy <= p.r2;
  }

  // p.kind === "ellipse"
  const dx = x - p.x;
  const dy = y - p.y;

  // Rotate into patch frame:
  // u = cos(a)*dx + sin(a)*dy
  // v = -sin(a)*dx + cos(a)*dy
  const xp = p.cosA * dx + p.sinA * dy;
  const yp = -p.sinA * dx + p.cosA * dy;

  return xp * xp * p.invRx2 + yp * yp * p.invRy2 <= 1;
}

/**
 * Brightness factor at (x,y) for a set of patches.
 *
 * Modes:
 * - "multiply": product of all containing patch factors.
 * - "max": maximum factor among containing patches (if none contain, factor = 1).
 * - "overrideLast": last containing patch wins (painter's algorithm).
 */
export function patchFactorAt(x: number, y: number, patches: PatchPre[], mode: PatchCombineMode): number {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 1;
  if (!Array.isArray(patches) || patches.length === 0) return 1;

  if (mode === "overrideLast") {
    let f = 1;
    for (const p of patches) {
      if (pointInPatch(x, y, p)) f = p.factor;
    }
    return Number.isFinite(f) ? Math.max(0, f) : 1;
  }

  if (mode === "max") {
    // Max factor among containing patches.
    // Note: If no patch contains the point, return the neutral factor 1.
    let f = 0;
    let hit = false;

    for (const p of patches) {
      if (pointInPatch(x, y, p)) {
        hit = true;
        f = Math.max(f, p.factor);
      }
    }

    if (!hit) return 1;
    return Number.isFinite(f) ? Math.max(0, f) : 1;
  }

  // mode === "multiply" (default)
  let f = 1;
  for (const p of patches) {
    if (pointInPatch(x, y, p)) f *= p.factor;
    // Early exit if factor drops to 0 (opaque spot)
    if (f === 0) return 0;
  }

  return Number.isFinite(f) ? Math.max(0, f) : 1;
}
