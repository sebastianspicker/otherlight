/**
 * Owns preset Edge Case Utils support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { SystemDynamicsParams, SystemParams } from "../core/types";
import { cloneParams, SCENARIO_DEFAULTS } from "./scenario";

export type EdgeCaseScenarioPreset = {
  id: string;
  label: string;
  description: string;
  params: SystemParams;
};

export function basePresetParams(): SystemParams {
  return cloneParams(SCENARIO_DEFAULTS);
}

export function withoutPatches(p: SystemParams): void {
  const ph = p.star.photometry;
  if (!ph) return;
  ph.brightnessPatches = [];
  delete ph.spotEvolution;
}

export function disableAdditiveTerms(p: SystemParams): void {
  const ph = p.star.photometry;
  if (!ph) return;
  delete ph.phaseCurve;
  delete ph.moonPhaseCurve;
  delete ph.forwardScattering;
  delete ph.ringScattering;
  delete ph.stellarVariability;
  delete ph.dayNightVisibility;
}

export function disableMeasurementTerms(p: SystemParams): void {
  const ph = p.star.photometry;
  if (!ph) return;
  ph.cadenceSec = 0;
  ph.nSubsamples = 1;
  if (ph.instrumentNoise) ph.instrumentNoise = { ...ph.instrumentNoise, enabled: false };
  if (ph.instrument) ph.instrument = { ...ph.instrument, enabled: false };
}

export function disableAdvancedAtmosphere(p: SystemParams): void {
  const ph = p.star.photometry;
  if (!ph) return;
  if (ph.atmosphereTransmission) ph.atmosphereTransmission = { ...ph.atmosphereTransmission, enabled: false };
  delete ph.atmosphereRT;
}

export function stripToTransitCase(p: SystemParams, opts?: { keepMoon?: boolean }): void {
  const keepMoon = Boolean(opts?.keepMoon);
  if (!keepMoon) delete p.moon;
  withoutPatches(p);
  disableAdditiveTerms(p);
  disableMeasurementTerms(p);
  disableAdvancedAtmosphere(p);
  delete p.dynamics?.nbodyPlanetMoon;
  if (p.dynamics?.exomoonTimingShape) p.dynamics.exomoonTimingShape.enabled = keepMoon;
  if (p.dynamics?.relativity) p.dynamics.relativity.enabled = false;
}

export function ensureMoon(p: SystemParams): NonNullable<SystemParams["moon"]> {
  if (!p.moon) p.moon = cloneParams(SCENARIO_DEFAULTS).moon!;
  return p.moon;
}

export function setPlanetImpactParameter(p: SystemParams, b: number): void {
  const orbit = p.planet.orbit;
  if (!("a" in orbit) || !("inc" in orbit)) return;
  const a = orbit.a;
  const rStar = p.star.r;
  if (!(Number.isFinite(a) && a > 0 && Number.isFinite(rStar) && rStar > 0)) return;
  const cosI = Math.max(-1, Math.min(1, (b * rStar) / a));
  orbit.inc = Math.acos(cosI);
}

export function enableAccuratePhysics(
  p: SystemParams,
  features: Partial<NonNullable<SystemDynamicsParams["physicsFeatures"]>>,
): void {
  const dyn = (p.dynamics ??= {});
  dyn.fidelityProfile = "accurate";
  dyn.physicsFeatures = {
    ...(dyn.physicsFeatures ?? {}),
    ...features,
  };
}

export function makeEdgeCasePreset(
  id: string,
  label: string,
  description: string,
  build: (p: SystemParams) => void,
): EdgeCaseScenarioPreset {
  const p = basePresetParams();
  build(p);
  return { id, label, description, params: p };
}
