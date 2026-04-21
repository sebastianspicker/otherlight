import { makeEdgeCasePreset, setPlanetImpactParameter, stripToTransitCase } from "./presetEdgeCaseUtils";

export const MEASUREMENT_EDGE_CASE_PRESETS = [
  makeEdgeCasePreset(
    "ec-measurement-white-noise-threshold",
    "Edge Case: white-noise threshold",
    "Small planet transit with measurement noise dominated by uncorrelated white noise.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      p.planet.r = 3.8e7;
      const ph = p.star.photometry;
      if (!ph) return;
      ph.instrumentNoise = {
        enabled: true,
        seed: 123,
        electronsPerUnitFlux: 1.2e5,
        exposureSec: 60,
        throughput: 1,
        photonNoise: { enabled: true, gaussianApproxMinElectrons: 0 },
        readNoise: { enabled: false },
        correlatedNoise: { enabled: false },
        trends: { enabled: false },
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-measurement-red-noise-threshold",
    "Edge Case: red-noise threshold",
    "Small planet transit with correlated noise strong enough to mimic a weak astrophysical shoulder.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      p.planet.r = 3.8e7;
      const ph = p.star.photometry;
      if (!ph) return;
      ph.instrumentNoise = {
        enabled: true,
        seed: 123,
        electronsPerUnitFlux: 1.2e5,
        exposureSec: 60,
        throughput: 1,
        photonNoise: { enabled: false },
        readNoise: { enabled: false },
        correlatedNoise: { enabled: true, sigmaFlux: 6e-4, tauSec: 420 },
        trends: { enabled: false },
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-measurement-roll-systematics",
    "Edge Case: roll systematics",
    "Central transit with a deterministic roll-dependent instrumental trend added on top of the physical flux.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const ph = p.star.photometry;
      if (!ph) return;
      ph.instrumentNoise = {
        enabled: true,
        seed: 21,
        photonNoise: { enabled: false },
        readNoise: { enabled: false },
        correlatedNoise: { enabled: false },
        trends: { enabled: true, roll: { enabled: true, ampFlux: 9e-4, periodSec: 5400, phase0: 0.2 } },
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-measurement-linear-drift",
    "Edge Case: linear drift",
    "Central transit with a slow instrumental drift so baseline estimation becomes part of the inference problem.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const ph = p.star.photometry;
      if (!ph) return;
      ph.instrumentNoise = {
        enabled: true,
        seed: 22,
        photonNoise: { enabled: false },
        readNoise: { enabled: false },
        correlatedNoise: { enabled: false },
        trends: {
          enabled: true,
          temperature: { enabled: true, linearSlopeFluxPerSec: 1.5e-7, randomWalkSigmaFluxPerSqrtSec: 0 },
        },
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-measurement-data-gap",
    "Edge Case: data gaps",
    "Central transit with explicit missing-observation windows so the learner sees that a real event can be physically present but only partially measured.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const ph = p.star.photometry;
      if (!ph) return;
      ph.instrumentNoise = {
        enabled: true,
        seed: 24,
        photonNoise: { enabled: false },
        readNoise: { enabled: false },
        correlatedNoise: { enabled: false },
        trends: { enabled: false },
        observer: {
          enabled: true,
          dataGaps: {
            enabled: true,
            windowsSec: [
              { startSec: -3600, endSec: -1800 },
              { startSec: 1200, endSec: 3000 },
            ],
          },
        },
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-measurement-detrended-linear-drift",
    "Edge Case: detrended linear drift",
    "Central transit with a slow instrumental drift and an explicit linear detrending stage, useful for teaching signal recovery versus signal distortion.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const ph = p.star.photometry;
      if (!ph) return;
      ph.instrumentNoise = {
        enabled: true,
        seed: 25,
        photonNoise: { enabled: false },
        readNoise: { enabled: false },
        correlatedNoise: { enabled: false },
        trends: {
          enabled: true,
          temperature: { enabled: true, linearSlopeFluxPerSec: 1.5e-7, randomWalkSigmaFluxPerSqrtSec: 0 },
        },
        postprocess: {
          enabled: true,
          detrend: {
            enabled: true,
            mode: "linear",
            windowSec: 12 * 3600,
            minSamples: 5,
            preserveBaseline: true,
          },
        },
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-measurement-read-noise-dominated",
    "Edge Case: read-noise dominated",
    "Small-body transit in a detector regime where read noise overwhelms the photometric signal.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      p.planet.r = 3.2e7;
      const ph = p.star.photometry;
      if (!ph) return;
      ph.instrumentNoise = {
        enabled: true,
        seed: 99,
        electronsPerUnitFlux: 5e4,
        exposureSec: 30,
        throughput: 0.15,
        photonNoise: { enabled: false },
        readNoise: { enabled: true, sigmaElectrons: 550 },
        correlatedNoise: { enabled: false },
        trends: { enabled: false },
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-observer-airmass-extinction",
    "Edge Case: airmass extinction",
    "Central transit viewed through increasing airmass so the measured baseline tilts even though the astrophysical scene itself is unchanged.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const ph = p.star.photometry;
      if (!ph) return;
      ph.instrumentNoise = {
        enabled: true,
        seed: 31,
        photonNoise: { enabled: false },
        readNoise: { enabled: false },
        correlatedNoise: { enabled: false },
        trends: { enabled: false },
        observer: {
          enabled: true,
          atmosphere: {
            enabled: true,
            airmass: {
              enabled: true,
              base: 1.2,
              linearPerSec: 3e-5,
              min: 1,
              max: 2.6,
              extinctionCoeff: 0.12,
            },
          },
        },
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-observer-scintillation",
    "Edge Case: scintillation",
    "Central transit with fast observer-atmosphere scintillation noise, making short-cadence measurements visibly more unstable.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const ph = p.star.photometry;
      if (!ph) return;
      ph.instrumentNoise = {
        enabled: true,
        seed: 32,
        exposureSec: 15,
        photonNoise: { enabled: false },
        readNoise: { enabled: false },
        correlatedNoise: { enabled: false },
        trends: { enabled: false },
        observer: {
          enabled: true,
          atmosphere: {
            enabled: true,
            airmass: { enabled: true, base: 1.4, extinctionCoeff: 0 },
            scintillation: { enabled: true, sigmaFlux: 0.003, airmassExponent: 1.5, exposureExponent: 0.5 },
          },
        },
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-observer-cloud-extinction",
    "Edge Case: cloud extinction",
    "Central transit with bounded cloud optical-depth fluctuations that move the measured baseline independently of the transit itself.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const ph = p.star.photometry;
      if (!ph) return;
      ph.instrumentNoise = {
        enabled: true,
        seed: 33,
        photonNoise: { enabled: false },
        readNoise: { enabled: false },
        correlatedNoise: { enabled: false },
        trends: { enabled: false },
        observer: {
          enabled: true,
          atmosphere: {
            enabled: true,
            airmass: { enabled: true, base: 1.5, extinctionCoeff: 0.06 },
            clouds: { enabled: true, meanOpticalDepth: 0.14, sigmaOpticalDepth: 0.025, tauSec: 1200 },
          },
        },
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-observer-seeing-loss",
    "Edge Case: seeing loss",
    "Central transit with seeing-driven aperture losses, demonstrating that motion and PSF changes can mimic slow photometric structure.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const ph = p.star.photometry;
      if (!ph) return;
      ph.instrumentNoise = {
        enabled: true,
        seed: 34,
        photonNoise: { enabled: false },
        readNoise: { enabled: false },
        correlatedNoise: { enabled: false },
        trends: { enabled: false },
        observer: {
          enabled: true,
          atmosphere: {
            enabled: true,
            airmass: { enabled: true, base: 1.35, extinctionCoeff: 0.04 },
            seeing: {
              enabled: true,
              meanLoss: 0.025,
              sigmaLoss: 0.008,
              tauSec: 900,
              airmassExponent: 0.6,
              maxLoss: 0.16,
            },
          },
        },
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-observer-telluric-absorption",
    "Edge Case: telluric absorption",
    "Central transit with observer-side telluric absorption so the learner sees a spectral-looking depth bias that does not come from the exoplanet atmosphere.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const ph = p.star.photometry;
      if (!ph) return;
      ph.instrumentNoise = {
        enabled: true,
        seed: 35,
        photonNoise: { enabled: false },
        readNoise: { enabled: false },
        correlatedNoise: { enabled: false },
        trends: { enabled: false },
        observer: {
          enabled: true,
          atmosphere: {
            enabled: true,
            airmass: { enabled: true, base: 1.55, extinctionCoeff: 0.03 },
            tellurics: {
              enabled: true,
              meanOpticalDepth: 0.09,
              sigmaOpticalDepth: 0.015,
              tauSec: 1500,
              airmassCoupling: 0.35,
            },
          },
        },
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-observer-sky-background",
    "Edge Case: sky background residual",
    "Central transit with background-subtraction residuals so the measured depth is biased even when the physical transit is unchanged.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const ph = p.star.photometry;
      if (!ph) return;
      ph.instrumentNoise = {
        enabled: true,
        seed: 36,
        electronsPerUnitFlux: 8e4,
        exposureSec: 60,
        throughput: 1,
        photonNoise: { enabled: false },
        readNoise: { enabled: false },
        correlatedNoise: { enabled: false },
        trends: { enabled: false },
        observer: {
          enabled: true,
          atmosphere: {
            enabled: true,
            skyBackground: { enabled: true, electronsPerSec: 1600, subtractionResidualFraction: 0.04 },
          },
        },
      };
    },
  ),
];
