import type { SystemParams } from "../core/types";
import { createSimulationV4, migrateSystemParamsToV4 } from "../sim/v4";
import { displayFluxValueForConfig } from "../sim/v4/binaryBaseline";

export type DidacticComparison = {
  tSec: number;
  fluxTotalDelta: number;
  fluxDisplayDelta?: number;
  fluxTransitDelta: number;
  rvStarDelta?: number;
  rvPlanetDelta?: number;
};

export function compareScenariosAtTime(a: SystemParams, b: SystemParams, tSec: number): DidacticComparison {
  const configA = migrateSystemParamsToV4(a);
  const configB = migrateSystemParamsToV4(b);
  const runtimeA = createSimulationV4(configA);
  const runtimeB = createSimulationV4(configB);
  const sa = runtimeA.step(tSec);
  const sb = runtimeB.step(tSec);

  return {
    tSec,
    fluxTotalDelta: sb.flux.total - sa.flux.total,
    fluxDisplayDelta:
      displayFluxValueForConfig(configB, sb.flux.total) - displayFluxValueForConfig(configA, sa.flux.total),
    fluxTransitDelta: (sb.flux.transitFactor ?? 1) - (sa.flux.transitFactor ?? 1),
    rvStarDelta: (sb.observables?.rvStar ?? 0) - (sa.observables?.rvStar ?? 0),
    rvPlanetDelta: (sb.observables?.rvPlanet ?? 0) - (sa.observables?.rvPlanet ?? 0),
  };
}

// TODO: toExponential is called on every delta value each invocation.
// Not a significant cost in practice, but could be cached if this becomes a hot path.
export function interpretDidacticComparison(
  cmp: DidacticComparison,
  context?: { lessonId?: string; comparisonPrompt?: string },
): string {
  const lines: string[] = [];
  lines.push(`ΔfluxTotal=${cmp.fluxTotalDelta.toExponential(3)}`);
  if (typeof cmp.fluxDisplayDelta === "number" && Number.isFinite(cmp.fluxDisplayDelta)) {
    lines.push(`ΔfluxDisplay=${cmp.fluxDisplayDelta.toExponential(3)}`);
  }
  lines.push(`ΔfluxTransit=${cmp.fluxTransitDelta.toExponential(3)}`);
  lines.push(`ΔrvStar=${(cmp.rvStarDelta ?? 0).toExponential(3)}`);
  lines.push(`ΔrvPlanet=${(cmp.rvPlanetDelta ?? 0).toExponential(3)}`);
  lines.push("");

  const absTransit = Math.abs(cmp.fluxTransitDelta);
  const absTotal = Math.abs(cmp.fluxTotalDelta);
  const absDisplay = Math.abs(cmp.fluxDisplayDelta ?? cmp.fluxTotalDelta);
  const absRvStar = Math.abs(cmp.rvStarDelta ?? 0);
  const absRvPlanet = Math.abs(cmp.rvPlanetDelta ?? 0);

  const lessonId = context?.lessonId;
  if (lessonId === "exomoon-transit-lab") {
    if (absTransit > 1e-4) {
      lines.push(
        "Interpretation: The moon or planet transit timing/geometry changed enough to alter the visible transit morphology.",
      );
    } else {
      lines.push(
        "Interpretation: The moon contribution remains subtle; compare lead/lag and moon visibility.",
      );
    }
  } else if (lessonId === "binary-eclipse-lab") {
    if (absDisplay > 1e-4) {
      lines.push(
        "Interpretation: The displayed binary eclipse depth changed, so the stellar flux balance or eclipse chord is different.",
      );
    } else {
      lines.push("Interpretation: The two binary cases are photometrically similar near this event.");
    }
  } else if (absTransit > 1e-4) {
    lines.push(
      "Interpretation: Transit geometry changed significantly (impact parameter / radius / inclination).",
    );
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

  if (context?.comparisonPrompt) {
    lines.push("");
    lines.push(`Lesson prompt: ${context.comparisonPrompt}`);
  }

  return lines.join("\n");
}
