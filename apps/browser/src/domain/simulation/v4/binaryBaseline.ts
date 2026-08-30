/**
 * Owns binary Baseline support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import { resolveDetachedBinaryLuminosities } from "../../photometry/stellarBandFlux";
import type { PassbandId } from "../../model/types";
import type { EducationScenarioV4, StarBodyV4 } from "./types";

type DetachedBinaryStars = {
  primary: StarBodyV4;
  secondary: StarBodyV4;
};

function isDetachedBinaryLab(config: EducationScenarioV4): boolean {
  return config.mode === "detached-binary-lab";
}

function detachedBinaryStars(config: EducationScenarioV4): DetachedBinaryStars | undefined {
  const [primary, secondary] = config.bodies.stars;
  return primary && secondary ? { primary, secondary } : undefined;
}

function isScientificBrowser(config: EducationScenarioV4): boolean {
  return config.runtime?.executionMode === "scientific-browser";
}

function detachedBinaryFallbackPassband(config: EducationScenarioV4): PassbandId | undefined {
  return isScientificBrowser(config) ? undefined : config.photometry?.limbDarkeningModel?.bandpass;
}

function detachedBinarySecondaryFallbackScale(config: EducationScenarioV4): number {
  return isScientificBrowser(config) ? 0 : 0.3;
}

function canUseDetachedBinaryLuminositySource(config: EducationScenarioV4, source: string): boolean {
  return !isScientificBrowser(config) || source === "physical-bandpass";
}

function positiveOrUndefined(value: number): number | undefined {
  return value > 0 ? value : undefined;
}

export function detachedBinaryBaselineFlux(config: EducationScenarioV4): number | undefined {
  if (!isDetachedBinaryLab(config)) return undefined;
  const stars = detachedBinaryStars(config);
  if (!stars) return undefined;

  const resolved = resolveDetachedBinaryLuminosities({
    primary: stars.primary,
    secondary: stars.secondary,
    fallbackPassband: detachedBinaryFallbackPassband(config),
    secondaryFallbackLuminosityScale: detachedBinarySecondaryFallbackScale(config),
  });

  if (!canUseDetachedBinaryLuminositySource(config, resolved.source)) {
    return undefined;
  }

  return positiveOrUndefined(resolved.primary + resolved.secondary);
}

export function displayFluxValueForConfig(config: EducationScenarioV4, flux: number): number {
  if (!Number.isFinite(flux)) return flux;
  const baseline = detachedBinaryBaselineFlux(config);
  return baseline !== undefined && Number.isFinite(baseline) && baseline > 0 ? flux / baseline : flux;
}
