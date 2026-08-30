/**
 * Owns presets Atmosphere Advanced support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import {
  enableAccuratePhysics,
  makeEdgeCasePreset,
  setPlanetImpactParameter,
  stripToTransitCase,
  type EdgeCaseScenarioPreset,
} from "./presetEdgeCaseUtils";

export const ADVANCED_ATMOSPHERE_EDGE_CASE_PRESETS: EdgeCaseScenarioPreset[] = [
  makeEdgeCasePreset(
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
  makeEdgeCasePreset(
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
  makeEdgeCasePreset(
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
