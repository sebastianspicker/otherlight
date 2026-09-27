/** Precomputes stellar spot and facula geometry for deterministic photometry. */
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

import type { BrightnessPatch } from "../model/types";
import { isFinitePositive } from "../model/units";

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

/** Test if point (x,y) lies inside a precomputed patch. */
function pointInPatch(x: number, y: number, patch: PatchPre): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return patch.kind === "circle" ? pointInCirclePatch(x, y, patch) : pointInEllipsePatch(x, y, patch);
}

function pointInCirclePatch(x: number, y: number, patch: PatchPreCircle): boolean {
  const dx = x - patch.x;
  const dy = y - patch.y;
  return dx * dx + dy * dy < patch.r2;
}

function pointInEllipsePatch(x: number, y: number, patch: PatchPreEllipse): boolean {
  const dx = x - patch.x;
  const dy = y - patch.y;
  const xp = patch.cosA * dx + patch.sinA * dy;
  const yp = -patch.sinA * dx + patch.cosA * dy;
  return xp * xp * patch.invRx2 + yp * yp * patch.invRy2 < 1;
}

function safePatchFactor(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 1;
}

function overrideLastPatchFactor(x: number, y: number, patches: PatchPre[]): number {
  let f = 1;
  for (const patch of patches) {
    if (pointInPatch(x, y, patch)) f = patch.factor;
  }
  return safePatchFactor(f);
}

function maxPatchFactor(x: number, y: number, patches: PatchPre[]): number {
  let f = 0;
  let hit = false;
  for (const patch of patches) {
    if (!pointInPatch(x, y, patch)) continue;
    hit = true;
    f = Math.max(f, patch.factor);
  }
  return hit ? safePatchFactor(f) : 1;
}

function multiplyPatchFactor(x: number, y: number, patches: PatchPre[]): number {
  let f = 1;
  for (const patch of patches) {
    if (pointInPatch(x, y, patch)) f *= patch.factor;
    if (f === 0) return 0;
  }
  return safePatchFactor(f);
}

function finitePatchBase(
  patch: BrightnessPatch | undefined,
): { x: number; y: number; factor: number } | undefined {
  if (!patch) return undefined;
  if (!Number.isFinite(patch.x) || !Number.isFinite(patch.y) || !Number.isFinite(patch.factor))
    return undefined;
  return { x: patch.x, y: patch.y, factor: Math.max(0, patch.factor) };
}

function sanitizeCirclePatch(patch: BrightnessPatch): PatchPreCircle | undefined {
  const base = finitePatchBase(patch);
  const r = patch.r ?? NaN;
  if (!base || !isFinitePositive(r)) return undefined;
  return { kind: "circle", ...base, r2: r * r };
}

function sanitizeEllipsePatch(patch: BrightnessPatch): PatchPreEllipse | undefined {
  const base = finitePatchBase(patch);
  const radii = finiteEllipseRadii(patch);
  if (!base || !radii) return undefined;

  const angle = Number.isFinite(patch.angle) ? (patch.angle as number) : 0;
  return {
    kind: "ellipse",
    ...base,
    invRx2: 1 / (radii.rx * radii.rx),
    invRy2: 1 / (radii.ry * radii.ry),
    cosA: Math.cos(angle),
    sinA: Math.sin(angle),
  };
}

function finiteEllipseRadii(patch: BrightnessPatch): { rx: number; ry: number } | undefined {
  const rx = patch.rx ?? NaN;
  const ry = patch.ry ?? NaN;
  return isFinitePositive(rx) && isFinitePositive(ry) ? { rx, ry } : undefined;
}

function sanitizeBrightnessPatch(patch: BrightnessPatch | undefined): PatchPre | undefined {
  if (patch?.shape === "circle") return sanitizeCirclePatch(patch);
  if (patch?.shape === "ellipse") return sanitizeEllipsePatch(patch);
  return undefined;
}

/**
 * Sanitize patches into a precomputed representation.
 * - Drops invalid entries.
 * - Clamps factor to >= 0 (negative intensity is unphysical).
 */
export function sanitizeBrightnessPatches(patches: BrightnessPatch[] | undefined): PatchPre[] {
  const out: PatchPre[] = [];

  for (const p of patches ?? []) {
    const sanitized = sanitizeBrightnessPatch(p);
    if (sanitized) out.push(sanitized);
  }

  return out;
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

  if (mode === "overrideLast") return overrideLastPatchFactor(x, y, patches);
  if (mode === "max") return maxPatchFactor(x, y, patches);
  return multiplyPatchFactor(x, y, patches);
}
