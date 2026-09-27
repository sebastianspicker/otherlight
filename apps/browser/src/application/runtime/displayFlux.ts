/**
 * Scales Education flux into display units and labels the active display baseline.
 */
import type { EducationScenarioV4 } from "../../domain/simulation/v4";
import { detachedBinaryBaselineFlux } from "../../domain/simulation/v4/binaryBaseline";

export function binaryFluxDisplayBaseline(config: EducationScenarioV4): number | undefined {
  return detachedBinaryBaselineFlux(config);
}

export function fluxDisplayTitle(config: EducationScenarioV4): string {
  return config.mode === "detached-binary-lab"
    ? "Flux (normalized to combined stellar baseline)"
    : "Flux (stellar units)";
}

export function scaleFluxForDisplay(flux: number, baseline: number): number {
  if (!Number.isFinite(flux)) return flux;
  return Number.isFinite(baseline) && baseline > 0 ? flux / baseline : flux;
}
