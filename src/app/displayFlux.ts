import type { SimulationConfigV4 } from "../sim/v4";
import { detachedBinaryBaselineFlux, displayFluxValueForConfig } from "../sim/v4/binaryBaseline";

export function binaryFluxDisplayBaseline(config: SimulationConfigV4): number | undefined {
  return detachedBinaryBaselineFlux(config);
}

export function fluxDisplayTitle(config: SimulationConfigV4): string {
  return config.mode === "detached-binary-lab"
    ? "Flux (normalized to combined stellar baseline)"
    : "Flux (stellar units)";
}

export function scaleFluxForDisplay(flux: number, baseline: number): number {
  if (!Number.isFinite(flux)) return flux;
  return Number.isFinite(baseline) && baseline > 0 ? flux / baseline : flux;
}

export function fluxValueForDisplay(config: SimulationConfigV4, flux: number): number {
  return displayFluxValueForConfig(config, flux);
}
