import { expect, it } from "vitest";

import { PRESETS, getPresetById } from "../../src/app/presets";
import { computeBodyKinematics } from "../../src/sim/kinematics";
import { getObserverDir } from "../../src/sim/observerContract";
import { stepSystem } from "../../src/sim/sim";

const EDGE_CASE_PRESET_IDS = [
  "ec-geometry-central-transit",
  "ec-geometry-grazing-transit",
  "ec-geometry-near-miss",
  "ec-geometry-long-cadence-smear",
  "ec-exomoon-separated",
  "ec-exomoon-overlap",
  "ec-exomoon-moon-only",
  "ec-geometry-oblate-planet",
  "ec-geometry-ringed-planet",
  "ec-stellar-limb-darkening-strong",
  "ec-stellar-spot-crossing",
  "ec-stellar-facula-crossing",
  "ec-stellar-unocculted-spots",
  "ec-stellar-unocculted-faculae",
  "ec-stellar-spot-evolution",
  "ec-stellar-flare-transient",
  "ec-stellar-pulsation-contamination",
  "ec-atmosphere-transmissive-halo",
  "ec-atmosphere-extended-exosphere",
  "ec-atmosphere-chromatic-transmission",
  "ec-atmosphere-molecular-feature",
  "ec-atmosphere-spectral-contamination",
  "ec-atmosphere-refraction-shoulder",
  "ec-atmosphere-forward-scattering",
  "ec-measurement-white-noise-threshold",
  "ec-measurement-red-noise-threshold",
  "ec-measurement-roll-systematics",
  "ec-measurement-linear-drift",
  "ec-measurement-data-gap",
  "ec-measurement-detrended-linear-drift",
  "ec-measurement-read-noise-dominated",
  "ec-observer-airmass-extinction",
  "ec-observer-scintillation",
  "ec-observer-cloud-extinction",
  "ec-observer-seeing-loss",
  "ec-observer-telluric-absorption",
  "ec-observer-sky-background",
  "ec-dynamics-reflex-wobble",
  "ec-dynamics-perturber-ttv",
  "ec-dynamics-mutual-inclination",
  "ec-dynamics-nodal-precession",
  "ec-dynamics-hill-edge",
  "ec-dynamics-close-encounter",
  "ec-relativity-ltte",
  "ec-relativity-shapiro",
  "ec-relativity-einstein-delay",
  "ec-relativity-clock-mismatch",
  "ec-relativity-light-bending-scale",
  "ec-relativity-gr-precession",
  "ec-stellar-granulation",
] as const;

function minPlanetImpactOverOrbit(id: string): number {
  const preset = getPresetById(id);
  const system = preset.params;
  const observerDir = getObserverDir(system);
  const orbit = system.planet.orbit;
  if (!("period" in orbit)) throw new Error("edge-case preset test requires explicit orbital period");

  let best = Number.POSITIVE_INFINITY;
  for (let idx = 0; idx <= 600; idx++) {
    const tSec = (orbit.period * idx) / 600;
    const kin = computeBodyKinematics(system, tSec, observerDir);
    if (!(kin.planetSky.z > 0)) continue;
    best = Math.min(best, Math.hypot(kin.planetSky.x, kin.planetSky.y) / system.star.r);
  }
  return best;
}

it("registers the new didactic edge-case preset library", () => {
  const ids = new Set(PRESETS.map((preset) => preset.id));
  for (const id of EDGE_CASE_PRESET_IDS) {
    expect(ids.has(id), id).toBe(true);
    expect(getPresetById(id).id).toBe(id);
  }
});

it("orders the core geometry presets by minimum planet impact parameter", () => {
  const central = minPlanetImpactOverOrbit("ec-geometry-central-transit");
  const grazing = minPlanetImpactOverOrbit("ec-geometry-grazing-transit");
  const nearMiss = minPlanetImpactOverOrbit("ec-geometry-near-miss");

  expect(central).toBeLessThan(0.1);
  expect(grazing).toBeGreaterThan(0.7);
  expect(grazing).toBeLessThan(1.2);
  expect(nearMiss).toBeGreaterThan(1.2);
  expect(central).toBeLessThan(grazing);
  expect(grazing).toBeLessThan(nearMiss);
});

it("configures representative atmosphere, dynamics, measurement, and relativity presets on the expected surfaces", () => {
  const atmosphere = getPresetById("ec-atmosphere-chromatic-transmission").params.star.photometry;
  expect(atmosphere?.atmosphereTransmission?.enabled).toBe(true);
  expect(atmosphere?.atmosphereTransmission?.lambdaNm).toEqual([450, 550, 800]);
  expect(atmosphere?.atmosphereTransmission?.tauScale).toEqual([1.25, 1, 0.72]);

  const molecular = getPresetById("ec-atmosphere-molecular-feature").params.star.photometry;
  expect(molecular?.atmosphereRT?.enabled).toBe(true);
  expect(molecular?.atmosphereRT?.molecularFeatures?.enabled).toBe(true);
  expect(molecular?.spectralBandpass?.enabled).toBe(true);

  const contaminatedAtmosphere = getPresetById("ec-atmosphere-spectral-contamination").params.star.photometry;
  expect(contaminatedAtmosphere?.atmosphereRT?.spectralContamination?.enabled).toBe(true);
  expect(contaminatedAtmosphere?.atmosphereRT?.molecularFeatures?.enabled).toBe(true);

  const refractive = getPresetById("ec-atmosphere-refraction-shoulder").params.star.photometry;
  expect(refractive?.atmosphereRT?.refraction?.enabled).toBe(true);
  expect(refractive?.atmosphereRT?.refraction?.amp).toBeGreaterThan(0);

  const noise = getPresetById("ec-measurement-red-noise-threshold").params.star.photometry?.instrumentNoise;
  expect(noise?.enabled).toBe(true);
  expect(noise?.correlatedNoise?.enabled).toBe(true);
  expect(noise?.correlatedNoise?.sigmaFlux).toBeGreaterThan(0);

  const gap = getPresetById("ec-measurement-data-gap").params.star.photometry?.instrumentNoise;
  expect(gap?.observer?.enabled).toBe(true);
  expect(gap?.observer?.dataGaps?.enabled).toBe(true);
  expect(gap?.observer?.dataGaps?.windowsSec?.length).toBeGreaterThan(0);

  const detrended = getPresetById("ec-measurement-detrended-linear-drift").params.star.photometry
    ?.instrumentNoise;
  expect(detrended?.postprocess?.enabled).toBe(true);
  expect(detrended?.postprocess?.detrend?.enabled).toBe(true);
  expect(detrended?.postprocess?.detrend?.mode).toBe("linear");

  const observer = getPresetById("ec-observer-airmass-extinction").params.star.photometry?.instrumentNoise;
  expect(observer?.observer?.enabled).toBe(true);
  expect(observer?.observer?.atmosphere?.airmass?.enabled).toBe(true);
  expect(observer?.observer?.atmosphere?.airmass?.extinctionCoeff).toBeGreaterThan(0);

  const flare = getPresetById("ec-stellar-flare-transient").params.star.photometry?.stellarVariability;
  expect(flare?.enabled).toBe(true);
  expect(flare?.flare?.enabled).toBe(true);
  expect(flare?.flare?.amp).toBeGreaterThan(0);

  const pulsation = getPresetById("ec-stellar-pulsation-contamination").params.star.photometry
    ?.stellarVariability;
  expect(pulsation?.pulsations?.enabled).toBe(true);
  expect(pulsation?.pulsations?.modes?.length).toBeGreaterThan(1);

  const dynamics = getPresetById("ec-dynamics-perturber-ttv").params.dynamics;
  expect(dynamics?.nbodyPlanetMoon?.enabled).toBe(true);
  expect(dynamics?.nbodyPlanetMoon?.perturbers?.length).toBeGreaterThan(0);

  const closeEncounter = getPresetById("ec-dynamics-close-encounter").params.dynamics;
  expect(closeEncounter?.collisionPolicy?.enabled).toBe(true);
  expect(closeEncounter?.collisionPolicy?.minSeparation).toBeGreaterThan(0);

  const relativity = getPresetById("ec-relativity-shapiro").params.dynamics;
  expect(relativity?.relativity?.enabled).toBe(true);
  expect(relativity?.relativity?.shapiro).toBe(true);
  expect(relativity?.relativityLevel).toBe("enhanced");

  const einstein = getPresetById("ec-relativity-einstein-delay").params.dynamics;
  expect(einstein?.relativity?.einsteinDelay).toBe(true);

  const clock = getPresetById("ec-relativity-clock-mismatch").params.observer;
  expect(clock?.timekeeping?.enabled).toBe(true);
  expect(clock?.timekeeping?.barycentricOffsetSec).toBeGreaterThan(0);

  const bending = getPresetById("ec-relativity-light-bending-scale").params.dynamics;
  expect(bending?.relativity?.lightBending).toBe(true);

  const granulation = getPresetById("ec-stellar-granulation").params.star.photometry?.stellarSurface;
  expect(granulation?.enabled).toBe(true);
  expect(granulation?.granulationSigma).toBeGreaterThan(0);
});

it("keeps representative edge-case presets numerically finite when stepped", () => {
  const sampledPresetIds = [
    "ec-geometry-ringed-planet",
    "ec-atmosphere-refraction-shoulder",
    "ec-atmosphere-forward-scattering",
    "ec-measurement-red-noise-threshold",
    "ec-observer-airmass-extinction",
    "ec-stellar-flare-transient",
    "ec-relativity-einstein-delay",
    "ec-dynamics-perturber-ttv",
    "ec-relativity-shapiro",
    "ec-stellar-granulation",
  ] as const;

  for (const id of sampledPresetIds) {
    const preset = getPresetById(id);
    const step = stepSystem(preset.params, 0);
    expect(Number.isFinite(step.fluxTotal), id).toBe(true);
    expect(Number.isFinite(step.fluxTransitFactor ?? 1), id).toBe(true);
  }
});
