/**
 * Owns compare Text support within the didactics layer. Keeps learning-flow behavior independent of simulation execution.
 */
import type { DidacticComparison } from "./compare";

function finiteOrZero(value: number | undefined): number {
  return value ?? 0;
}

function finiteDisplayDeltaLine(cmp: DidacticComparison): string[] {
  return typeof cmp.fluxDisplayDelta === "number" && Number.isFinite(cmp.fluxDisplayDelta)
    ? [`ΔfluxDisplay=${cmp.fluxDisplayDelta.toExponential(3)}`]
    : [];
}

function scalarDeltaLines(cmp: DidacticComparison): string[] {
  return [
    `ΔfluxTotal=${cmp.fluxTotalDelta.toExponential(3)}`,
    ...finiteDisplayDeltaLine(cmp),
    `ΔfluxTransit=${cmp.fluxTransitDelta.toExponential(3)}`,
    `ΔrvStar=${finiteOrZero(cmp.rvStarDelta).toExponential(3)}`,
    `ΔrvPlanet=${finiteOrZero(cmp.rvPlanetDelta).toExponential(3)}`,
  ];
}

export function appendScalarDeltas(lines: string[], cmp: DidacticComparison): void {
  lines.push(...scalarDeltaLines(cmp));
  lines.push("");
}

function exomoonInterpretation(absTransit: number): string {
  return absTransit > 1e-4
    ? "Interpretation: The moon or planet transit timing/geometry changed enough to alter the visible transit morphology."
    : "Interpretation: The moon contribution remains subtle; compare lead/lag and moon visibility.";
}

function binaryInterpretation(absDisplay: number): string {
  return absDisplay > 1e-4
    ? "Interpretation: The displayed binary eclipse depth changed, so the stellar flux balance or eclipse chord is different."
    : "Interpretation: The two binary cases are photometrically similar near this event.";
}

function defaultInterpretation(absTransit: number, absTotal: number): string {
  if (absTransit > 1e-4) {
    return "Interpretation: Transit geometry changed significantly (impact parameter / radius / inclination).";
  }
  if (absTotal > 1e-4) {
    return "Interpretation: Additive photometry dominates the change (reflection / emission / stellar variability).";
  }
  return "Interpretation: Only minor photometric differences; the two scenarios are similar.";
}

export function interpretationLine(cmp: DidacticComparison, lessonId: string | undefined): string {
  const absTransit = Math.abs(cmp.fluxTransitDelta);
  const absTotal = Math.abs(cmp.fluxTotalDelta);
  const absDisplay = Math.abs(cmp.fluxDisplayDelta ?? cmp.fluxTotalDelta);

  if (lessonId === "exomoon-transit-lab") return exomoonInterpretation(absTransit);
  if (lessonId === "binary-eclipse-lab") return binaryInterpretation(absDisplay);
  return defaultInterpretation(absTransit, absTotal);
}

export function dynamicsNote(cmp: DidacticComparison): string {
  const absRvStar = Math.abs(cmp.rvStarDelta ?? 0);
  const absRvPlanet = Math.abs(cmp.rvPlanetDelta ?? 0);
  return absRvStar > 1e-3 || absRvPlanet > 1e-3
    ? "Dynamics note: RV deltas indicate changed mass or orbital dynamics."
    : "Dynamics note: No significant radial-velocity shift.";
}
