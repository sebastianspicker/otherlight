/**
 * Owns display Flux support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { EducationScenarioV4 } from "../domain/simulation/v4";
import {
  detachedBinaryBaselineFlux,
  displayFluxValueForConfig,
} from "../domain/simulation/v4/binaryBaseline";

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

export function fluxValueForDisplay(config: EducationScenarioV4, flux: number): number {
  return displayFluxValueForConfig(config, flux);
}
