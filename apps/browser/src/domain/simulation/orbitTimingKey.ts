/**
 * Owns orbit Timing Key support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import type { OrbitElements } from "../model/types";

/**
 * Stable cache-key fragment for orbit elements that affect transit timing.
 *
 * `toPrecision(17)` keeps distinct IEEE-754 numbers distinct enough for cache
 * invalidation without introducing locale-dependent formatting.
 */
export function orbitTimingKey(prefix: string, orbit: OrbitElements | undefined): string {
  if (!orbit) return `${prefix}:no-orbit`;
  return [prefix, orbit.a, orbit.e, orbit.inc, orbit.Omega, orbit.omega, orbit.period, orbit.t0]
    .map((value) =>
      typeof value === "number" && Number.isFinite(value) ? value.toPrecision(17) : String(value),
    )
    .join(":");
}
