import type { OrbitElements } from "../core/types";
import { muFromPeriodAndA } from "./kepler";

export function finiteNonZeroOverride(value: number | undefined): number | undefined {
  return Number.isFinite(value) && value !== 0 ? (value as number) : undefined;
}

export function hasPositiveOrbitScale(orbit: OrbitElements): boolean {
  return isPositiveFinite(orbit.a) && isPositiveFinite(orbit.period);
}

export function resolveOrbitMu(orbit: OrbitElements, overrideMu: number | undefined): number {
  return isPositiveFinite(overrideMu) ? overrideMu : muFromPeriodAndA(orbit.period, orbit.a);
}

export function hasValidGrPrecessionInputs(params: { mu: number; a: number; e: number; c: number }): boolean {
  return (
    isPositiveFinite(params.mu) &&
    isPositiveFinite(params.a) &&
    isEllipticEccentricity(params.e) &&
    isPositiveFinite(params.c)
  );
}

export function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isEllipticEccentricity(e: number): boolean {
  return Number.isFinite(e) && e >= 0 && e < 1;
}

export function grPrecessionDenominator(a: number, e: number, c: number): number {
  return a * (1 - e * e) * c * c;
}
