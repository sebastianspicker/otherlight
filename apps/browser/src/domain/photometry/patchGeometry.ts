/**
 * Owns patch Geometry support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import type { PatchPre, PatchPreCircle, PatchPreEllipse } from "./patchTypes";

/** Test if point (x,y) lies inside a precomputed patch. */
export function pointInPatch(x: number, y: number, patch: PatchPre): boolean {
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
