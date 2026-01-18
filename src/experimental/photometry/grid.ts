// src/experimental/photometry/grid.ts

//
// Shared resolution helpers for disk-integral photometry.
//
// Policy note (repo-wide):
// - Use clampGridRes(...) as the canonical implementation so all integrators share
//   the same min/max caps and fallback behavior.

import { clampGridRes } from "../../photometry/occulterCircle";

/**
 * Resolve a grid resolution parameter into a safe integer.
 *
 * Backwards-compat wrapper:
 * - Historically this file exposed resolveGridRes without a max cap.
 * - For consistency and runtime protection, it now delegates to clampGridRes.
 *
 * Parameters:
 * - raw: unknown input (number, string, etc.)
 * - fallback: used when raw is not finite (default 220)
 * - min: minimum resolution (default 60)
 *
 * Note:
 * - Maximum cap is enforced via clampGridRes (default maxRes=4096), matching repo policy.
 */
export function resolveGridRes(raw: unknown, fallback = 220, min = 60): number {
  return clampGridRes(raw, fallback, { minRes: min });
}
