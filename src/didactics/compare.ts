import type { SystemParams } from "../core/types";
import { createSimulation, toSimulationConfigV3 } from "../sim/v3";

export type DidacticComparison = {
  tSec: number;
  fluxTotalDelta: number;
  fluxTransitDelta: number;
  rvStarDelta?: number;
  rvPlanetDelta?: number;
};

export function compareScenariosAtTime(a: SystemParams, b: SystemParams, tSec: number): DidacticComparison {
  const runtimeA = createSimulation(toSimulationConfigV3(a));
  const runtimeB = createSimulation(toSimulationConfigV3(b));
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
