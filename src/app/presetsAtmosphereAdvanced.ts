import type { SystemDynamicsParams, SystemParams } from "../core/types";
import { cloneParams, SCENARIO_DEFAULTS } from "./scenario";

type AtmosphereScenarioPreset = {
  id: string;
  label: string;
  description: string;
  params: SystemParams;
};

function base(): SystemParams {
  return cloneParams(SCENARIO_DEFAULTS);
}

function withoutPatches(p: SystemParams): void {
  const ph = p.star.photometry;
  if (!ph) return;
  ph.brightnessPatches = [];
  delete ph.spotEvolution;
}

function disableAdditiveTerms(p: SystemParams): void {
  const ph = p.star.photometry;
  if (!ph) return;
  delete ph.phaseCurve;
  delete ph.moonPhaseCurve;
  delete ph.forwardScattering;
  delete ph.ringScattering;
  delete ph.stellarVariability;
  delete ph.dayNightVisibility;
}

function disableMeasurementTerms(p: SystemParams): void {
  const ph = p.star.photometry;
  if (!ph) return;
  ph.cadenceSec = 0;
  ph.nSubsamples = 1;
  if (ph.instrumentNoise) ph.instrumentNoise = { ...ph.instrumentNoise, enabled: false };
  if (ph.instrument) ph.instrument = { ...ph.instrument, enabled: false };
}

function disableAdvancedAtmosphere(p: SystemParams): void {
  const ph = p.star.photometry;
  if (!ph) return;
  if (ph.atmosphereTransmission) ph.atmosphereTransmission = { ...ph.atmosphereTransmission, enabled: false };
  delete ph.atmosphereRT;
}

function stripToTransitCase(p: SystemParams): void {
  delete p.moon;
  withoutPatches(p);
  disableAdditiveTerms(p);
  disableMeasurementTerms(p);
  disableAdvancedAtmosphere(p);
  delete p.dynamics?.nbodyPlanetMoon;
  if (p.dynamics?.exomoonTimingShape) p.dynamics.exomoonTimingShape.enabled = false;
  if (p.dynamics?.relativity) p.dynamics.relativity.enabled = false;
}

function setPlanetImpactParameter(p: SystemParams, b: number): void {
  const orbit = p.planet.orbit;
  if (!("a" in orbit) || !("inc" in orbit)) return;
  const a = orbit.a;
  const rStar = p.star.r;
  if (!(Number.isFinite(a) && a > 0 && Number.isFinite(rStar) && rStar > 0)) return;
  const cosI = Math.max(-1, Math.min(1, (b * rStar) / a));
  orbit.inc = Math.acos(cosI);
}

function enableAccuratePhysics(
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

function makePreset(
  id: string,
  label: string,
  description: string,
  build: (p: SystemParams) => void,
): AtmosphereScenarioPreset {
  const p = base();
  build(p);
  return { id, label, description, params: p };
}

export const ADVANCED_ATMOSPHERE_EDGE_CASE_PRESETS: AtmosphereScenarioPreset[] = [
  makePreset(
    "ec-atmosphere-molecular-feature",
    "Edge Case: molecular feature surrogate",
    "Bounded atmosphere-RT transit case with a narrow line-center opacity feature so the learner can compare continuum and absorption-dominated wavelengths.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.08);
      enableAccuratePhysics(p, { atmosphereRT: true });
      const ph = p.star.photometry;
      if (!ph) return;
      ph.spectralBandpass = {
        enabled: true,
        lambdaNm: [500, 589, 760],
        weights: [0.3, 0.45, 0.25],
      };
      ph.atmosphereRT = {
        enabled: true,
        target: "planet",
        lambdaRefNm: 589,
        layers: [{ r0: p.planet.r, H: 1.5e7, tau0: 0.8, alpha: 0.25 }],
        cloudHaze: { enabled: true, hazeTau: 0.08, hazeSlope: 0.7 },
        molecularFeatures: {
          enabled: true,
          centerNm: [589],
          widthNm: [12],
          strength: [1.6],
        },
      };
    },
  ),
  makePreset(
    "ec-atmosphere-spectral-contamination",
    "Edge Case: spectral contamination surrogate",
    "Same bounded spectral transit lane, but with an observer-side throughput loss that downweights the deepest atmospheric feature and biases the integrated depth.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.08);
      enableAccuratePhysics(p, { atmosphereRT: true });
      const ph = p.star.photometry;
      if (!ph) return;
      ph.spectralBandpass = {
        enabled: true,
        lambdaNm: [500, 589, 760],
        weights: [1, 1, 1],
      };
      ph.atmosphereRT = {
        enabled: true,
        target: "planet",
        lambdaRefNm: 589,
        layers: [{ r0: p.planet.r, H: 1.4e7, tau0: 0.75, alpha: 0.2 }],
        molecularFeatures: {
          enabled: true,
          centerNm: [589],
          widthNm: [10],
          strength: [1.8],
        },
        spectralContamination: {
          enabled: true,
          centerNm: [589],
          widthNm: [9],
          strength: [2.2],
        },
      };
    },
  ),
  makePreset(
    "ec-atmosphere-refraction-shoulder",
    "Edge Case: atmospheric refraction shoulder",
    "Bounded additive atmosphere-RT preset with a small pre/post-contact refractive brightening shoulder layered onto an otherwise standard transit.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.12);
      enableAccuratePhysics(p, { atmosphereRT: true });
      const ph = p.star.photometry;
      if (!ph) return;
      ph.additiveComposition = "higher-fidelity-coupled";
      ph.spectralBandpass = {
        enabled: true,
        lambdaNm: [450, 550, 750],
        weights: [0.25, 0.5, 0.25],
      };
      ph.atmosphereRT = {
        enabled: true,
        target: "planet",
        lambdaRefNm: 550,
        layers: [{ r0: p.planet.r, H: 1.2e7, tau0: 0.35 }],
        refraction: {
          enabled: true,
          amp: 0.0016,
          width: 4.5e7,
          chromaticSlope: 0.6,
        },
      };
    },
  ),
];
