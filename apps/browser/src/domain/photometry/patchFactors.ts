/**
 * Owns patch Factors support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import { pointInPatch } from "./patchGeometry";
import type { PatchPre } from "./patchTypes";

export function overrideLastPatchFactor(x: number, y: number, patches: PatchPre[]): number {
  let f = 1;
  for (const patch of patches) {
    if (pointInPatch(x, y, patch)) f = patch.factor;
  }
  return safePatchFactor(f);
}

export function maxPatchFactor(x: number, y: number, patches: PatchPre[]): number {
  let f = 0;
  let hit = false;
  for (const patch of patches) {
    if (!pointInPatch(x, y, patch)) continue;
    hit = true;
    f = Math.max(f, patch.factor);
  }
  return hit ? safePatchFactor(f) : 1;
}

export function multiplyPatchFactor(x: number, y: number, patches: PatchPre[]): number {
  let f = 1;
  for (const patch of patches) {
    if (pointInPatch(x, y, patch)) f *= patch.factor;
    if (f === 0) return 0;
  }
  return safePatchFactor(f);
}

function safePatchFactor(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 1;
}
