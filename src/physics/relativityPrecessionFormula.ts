/**
 * Owns relativity Precession Formula support within the physics layer. Keeps numerical and frame conventions centralized for all consumers.
 */
import {
  grPrecessionDenominator,
  hasValidGrPrecessionInputs,
  isPositiveFinite,
} from "./relativityPrecessionInputs";

/**
 * Apsidal precession per orbit from the GR weak-field formula:
 * Δω = 6π * mu / (a (1 - e^2) c^2)
 */
export function grPrecessionPerOrbit(params: { mu: number; a: number; e: number; c: number }): number {
  if (!hasValidGrPrecessionInputs(params)) return 0;
  const denom = grPrecessionDenominator(params.a, params.e, params.c);
  if (!isPositiveFinite(denom)) return 0;

  return (6 * Math.PI * params.mu) / denom;
}
