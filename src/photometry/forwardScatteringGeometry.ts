/**
 * Owns forward Scattering Geometry support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import { clamp } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { vDot, vIsFinite, vNormalizeOrThrow } from "../physics/vec3";

/**
 * Numerically stable "wrap to [-π, π]" for phase differences.
 */
export function wrapPi(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.atan2(Math.sin(x), Math.cos(x));
}

/**
 * Henyey-Greenstein phase function p(theta), normalized over 4pi.
 */
export function henyeyGreensteinPhase(g: number, cosTheta: number): number {
  const gg = clamp(g, -0.999, 0.999);
  const mu = clamp(cosTheta, -1, 1);
  const denom = 1 + gg * gg - 2 * gg * mu;
  const d = Math.max(1e-12, denom);
  const p = (1 / (4 * Math.PI)) * ((1 - gg * gg) / Math.pow(d, 1.5));
  return Number.isFinite(p) ? p : 0;
}

/**
 * Approximate scattering angle for "forward scattering around transit".
 */
export function approximateCosScatteringAngle(rBody: Vec3, observerDirUnit: Vec3): number {
  if (!vIsFinite(rBody)) return 0;
  const rHat = normalizedBodyDirection(rBody);
  if (!rHat) return 0;
  const cosTheta = vDot(rHat, observerDirUnit);
  return clamp(cosTheta, -1, 1);
}

function normalizedBodyDirection(rBody: Vec3): Vec3 | undefined {
  try {
    return vNormalizeOrThrow(rBody, 1e-15, "rBody must be non-zero for scattering angle.");
  } catch {
    return undefined;
  }
}
