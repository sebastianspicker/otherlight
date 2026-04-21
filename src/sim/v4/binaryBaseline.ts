import { resolveDetachedBinaryLuminosities } from "../../photometry/stellarBandFlux";
import type { SimulationConfigV4 } from "./types";

export function detachedBinaryBaselineFlux(config: SimulationConfigV4): number | undefined {
  if (config.mode !== "detached-binary-lab") return undefined;
  const [starA, starB] = config.bodies.stars;
  if (!starA || !starB) return undefined;

  const resolved = resolveDetachedBinaryLuminosities({
    primary: starA,
    secondary: starB,
    fallbackPassband:
      config.runtime?.executionMode === "scientific-browser"
        ? undefined
        : config.photometry?.limbDarkeningModel?.bandpass,
    secondaryFallbackLuminosityScale: config.runtime?.executionMode === "scientific-browser" ? 0 : 0.3,
  });

  if (config.runtime?.executionMode === "scientific-browser" && resolved.source !== "physical-bandpass") {
    return undefined;
  }

  const total = resolved.primary + resolved.secondary;
  return total > 0 ? total : undefined;
}

export function displayFluxValueForConfig(config: SimulationConfigV4, flux: number): number {
  if (!Number.isFinite(flux)) return flux;
  const baseline = detachedBinaryBaselineFlux(config);
  return baseline !== undefined && Number.isFinite(baseline) && baseline > 0 ? flux / baseline : flux;
}
