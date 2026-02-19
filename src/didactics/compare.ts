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
    lines.push("Interpretation: Transit-geometrie hat sich merklich geändert (Impact/Radius/Inklination).");
  } else if (absTotal > 1e-4) {
    lines.push(
      "Interpretation: Additive Photometrie dominiert die Änderung (Reflexion/Emission/Variability).",
    );
  } else {
    lines.push("Interpretation: Nur kleine photometrische Änderungen; Szenarien sind nahe beieinander.");
  }

  if (absRvStar > 1e-3 || absRvPlanet > 1e-3) {
    lines.push("Dynamik-Hinweis: RV-Deltas deuten auf geänderte Massen-/Bahndynamik hin.");
  } else {
    lines.push("Dynamik-Hinweis: Keine starke RV-Verschiebung.");
  }

  return lines.join("\n");
}
