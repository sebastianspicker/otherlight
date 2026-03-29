import type { SystemParams } from "../core/types";
import { createSimulationV4, migrateSystemParamsToV4 } from "../sim/v4";

export type DidacticComparison = {
  tSec: number;
  fluxTotalDelta: number;
  fluxTransitDelta: number;
  rvStarDelta?: number;
  rvPlanetDelta?: number;
};

export function compareScenariosAtTime(a: SystemParams, b: SystemParams, tSec: number): DidacticComparison {
  const runtimeA = createSimulationV4(migrateSystemParamsToV4(a));
  const runtimeB = createSimulationV4(migrateSystemParamsToV4(b));
  const sa = runtimeA.step(tSec);
  const sb = runtimeB.step(tSec);

  return {
    tSec,
    fluxTotalDelta: sb.flux.total - sa.flux.total,
    fluxTransitDelta: (sb.flux.transitFactor ?? 1) - (sa.flux.transitFactor ?? 1),
    rvStarDelta: (sb.observables?.rvStar ?? 0) - (sa.observables?.rvStar ?? 0),
    rvPlanetDelta: (sb.observables?.rvPlanet ?? 0) - (sa.observables?.rvPlanet ?? 0),
  };
}

// TODO: toExponential is called on every delta value each invocation.
// Not a significant cost in practice, but could be cached if this becomes a hot path.
export function interpretDidacticComparison(cmp: DidacticComparison): string {
  const lines: string[] = [];
  lines.push(`ΔfluxTotal=${cmp.fluxTotalDelta.toExponential(3)}`);
  lines.push(`ΔfluxTransit=${cmp.fluxTransitDelta.toExponential(3)}`);
  lines.push(`ΔrvStar=${(cmp.rvStarDelta ?? 0).toExponential(3)}`);
  lines.push(`ΔrvPlanet=${(cmp.rvPlanetDelta ?? 0).toExponential(3)}`);
  lines.push("");

  const absTransit = Math.abs(cmp.fluxTransitDelta);
  const absTotal = Math.abs(cmp.fluxTotalDelta);
  const absRvStar = Math.abs(cmp.rvStarDelta ?? 0);
  const absRvPlanet = Math.abs(cmp.rvPlanetDelta ?? 0);

  if (absTransit > 1e-4) {
    lines.push("Interpretation: Transit geometry changed significantly (impact parameter / radius / inclination).");
  } else if (absTotal > 1e-4) {
    lines.push(
      "Interpretation: Additive photometry dominates the change (reflection / emission / stellar variability).",
    );
  } else {
    lines.push("Interpretation: Only minor photometric differences; the two scenarios are similar.");
  }

  if (absRvStar > 1e-3 || absRvPlanet > 1e-3) {
    lines.push("Dynamics note: RV deltas indicate changed mass or orbital dynamics.");
  } else {
    lines.push("Dynamics note: No significant radial-velocity shift.");
  }

  return lines.join("\n");
}
