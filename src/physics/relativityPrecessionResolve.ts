/**
 * Owns relativity Precession Resolve support within the physics layer. Keeps numerical and frame conventions centralized for all consumers.
 */
import type { OrbitElements } from "../core/types";
import { grPrecessionPerOrbit } from "./relativityPrecessionFormula";
import {
  finiteNonZeroOverride,
  hasPositiveOrbitScale,
  isPositiveFinite,
  resolveOrbitMu,
} from "./relativityPrecessionInputs";

/**
 * Resolve GR precession per orbit using the standard weak-field formula if no override is provided.
 * If override is a non-zero finite number, it takes precedence.
 */
export function resolveGrPrecessionPerOrbit(params: {
  orbit: OrbitElements;
  c: number;
  override?: number;
  mu?: number;
}): number {
  const override = finiteNonZeroOverride(params.override);
  if (override !== undefined) return override;
  if (!hasPositiveOrbitScale(params.orbit)) return 0;

  const mu = resolveOrbitMu(params.orbit, params.mu);
  if (!isPositiveFinite(mu)) return 0;
  return grPrecessionPerOrbit({ mu, a: params.orbit.a, e: params.orbit.e, c: params.c });
}
