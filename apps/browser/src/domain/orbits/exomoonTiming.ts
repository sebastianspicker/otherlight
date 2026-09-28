/** Computes exomoon timing signals from the system geometry and orbital state. */
//
// Exomoon timing/shape diagnostics.
//
// Scientific intent (toy-model but physically motivated):
// - Transit duration scales approximately as 1 / v⊥, where v⊥ is the projected (sky-plane) speed.
// - Impact parameter diagnostics from sky-plane geometry.
//
// Design constraints:
// - No dependency on sim.ts (avoid circular deps).
// - Pure functions, deterministic.
// - Robust handling of non-finite inputs.
// - Results in simulator-native units (length units, seconds, radians).

export type SkyPoint = { x: number; y: number; z: number };

/**
 * TDV-like diagnostic ratio under the v⊥ approximation:
 * TDV_ratio ≡ T(t)/T_ref ≈ v⊥(t_ref) / v⊥(t)
 */
export function tdvRatioFromSkyPlaneSpeeds(vRef: number, vNow: number, eps = 1e-15): number {
  if (!Number.isFinite(vRef) || vRef < 0) return NaN;
  if (!Number.isFinite(vNow) || vNow < eps) return NaN;

  const r = vRef / vNow;
  return Number.isFinite(r) ? r : NaN;
}

/**
 * Physical front-of-star impact parameter:
 * b = sqrt(x^2 + y^2) / Rstar
 *
 * Only defined when the body is in front of the stellar disk plane (`sky.z > 0`).
 * Behind-star geometry returns NaN so higher-level callers can omit the value.
 */
export function impactParameterFromProjectedSky(sky: SkyPoint | undefined, rStar: number): number {
  if (!isFrontFiniteSkyPoint(sky)) return NaN;
  if (!isPositiveFiniteRadius(rStar)) return NaN;

  const b = Math.hypot(sky.x, sky.y) / rStar;
  return Number.isFinite(b) ? b : NaN;
}

function isFrontFiniteSkyPoint(sky: SkyPoint | undefined): sky is SkyPoint {
  if (!sky) return false;
  return Number.isFinite(sky.x) && Number.isFinite(sky.y) && Number.isFinite(sky.z) && sky.z > 0;
}

function isPositiveFiniteRadius(radius: number): boolean {
  return Number.isFinite(radius) && radius > 0;
}
