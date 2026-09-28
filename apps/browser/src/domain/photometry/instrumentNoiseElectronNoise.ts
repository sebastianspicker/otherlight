/** Samples and applies detector electron-count noise. */
import { clamp, toFiniteNonNeg, toFiniteNumber } from "../model/units";
import { normal as normalSample, poisson as poissonSample, type PRNG as PRNGPublic } from "./random";
import type { InstrumentNoiseState, InstrumentNoiseSystematicsParams } from "./instrumentNoiseTypes";

type AtmosphereConfig = NonNullable<NonNullable<InstrumentNoiseSystematicsParams["observer"]>["atmosphere"]>;
type ElectronScale = { throughput: number; ePerFluxPerSec: number; exposureSec: number };

export function applyElectronNoise(
  state: InstrumentNoiseState,
  cfg: InstrumentNoiseSystematicsParams,
  fluxPreNoise: number,
): number {
  const scale = resolveElectronScale(cfg);
  if (!scale) return fluxPreNoise;
  const atmosphere = cfg.observer?.enabled ? cfg.observer.atmosphere : undefined;
  const skyCfg = atmosphere?.enabled ? atmosphere.skyBackground : undefined;
  const meanElectrons =
    Math.max(0, fluxPreNoise) * scale.throughput * scale.ePerFluxPerSec * scale.exposureSec;
  const meanSkyElectrons = meanSkyBackgroundElectrons(skyCfg, scale.exposureSec);
  const skyResidualFraction = clamp(toFiniteNumber(skyCfg?.subtractionResidualFraction, 0), 0, 1);
  let electrons = applyPhotonAndSkyNoise(state, cfg, meanElectrons, meanSkyElectrons, skyResidualFraction);
  electrons = applyReadNoise(state, cfg.readNoise, electrons);
  electrons = applyDetectorElectronEffects(cfg.detector, electrons);
  const denom = scale.throughput * scale.ePerFluxPerSec * scale.exposureSec;
  return denom > 0 ? electrons / denom : fluxPreNoise;
}

const resolveElectronScale = (cfg: InstrumentNoiseSystematicsParams): ElectronScale | undefined => {
  const throughput = toFiniteNonNeg(cfg.throughput, 1);
  const ePerFluxPerSec = Math.max(0, toFiniteNumber(cfg.electronsPerUnitFlux, 1e6));
  const exposureSec = toFiniteNonNeg(cfg.exposureSec, 0);
  return exposureSec > 0 && ePerFluxPerSec > 0 && throughput > 0
    ? { throughput, ePerFluxPerSec, exposureSec }
    : undefined;
};

const meanSkyBackgroundElectrons = (
  skyCfg: AtmosphereConfig["skyBackground"] | undefined,
  exposureSec: number,
): number =>
  skyCfg?.enabled && exposureSec > 0
    ? Math.max(0, toFiniteNumber(skyCfg.electronsPerSec, 0)) * exposureSec
    : 0;

const applyPhotonAndSkyNoise = (
  state: InstrumentNoiseState,
  cfg: InstrumentNoiseSystematicsParams,
  meanElectrons: number,
  meanSkyElectrons: number,
  skyResidualFraction: number,
): number => {
  if (!(cfg.photonNoise?.enabled || meanSkyElectrons > 0)) return meanElectrons;
  const sourceElectrons = sampleElectrons(meanElectrons, cfg.photonNoise, state);
  const skyElectrons = sampleElectrons(meanSkyElectrons, cfg.photonNoise, state);
  return sourceElectrons + (skyElectrons - meanSkyElectrons) + meanSkyElectrons * skyResidualFraction;
};

const sampleElectrons = (
  meanElectrons: number,
  cfg: InstrumentNoiseSystematicsParams["photonNoise"] | undefined,
  rngOwner: { rng: PRNGPublic },
): number => {
  const mean = Math.max(0, meanElectrons);
  if (!cfg?.enabled) return mean;
  const gaussThresh = Math.max(0, toFiniteNumber(cfg.gaussianApproxMinElectrons, 50));
  return mean >= gaussThresh
    ? normalSample(rngOwner.rng, mean, Math.sqrt(mean))
    : poissonSample(rngOwner.rng, mean);
};

const applyReadNoise = (
  state: InstrumentNoiseState,
  readNoise: InstrumentNoiseSystematicsParams["readNoise"],
  electrons: number,
): number => {
  if (!readNoise?.enabled) return electrons;
  const sigma = toFiniteNonNeg(readNoise.sigmaElectrons, 0);
  return sigma > 0 ? electrons + normalSample(state.rng, 0, sigma) : electrons;
};

const applyDetectorElectronEffects = (
  det: InstrumentNoiseSystematicsParams["detector"],
  initialElectrons: number,
): number => {
  if (!det?.enabled) return initialElectrons;
  let electrons = initialElectrons;
  const nonlinearity = Math.max(0, toFiniteNumber(det.nonlinearityCoeff, 0));
  if (nonlinearity > 0) electrons = Math.max(0, electrons * (1 - nonlinearity * Math.max(0, electrons)));
  const cti = Math.max(0, toFiniteNumber(det.ctiTrailCoeff, 0));
  if (cti > 0) electrons = Math.max(0, electrons - cti * Math.sqrt(Math.max(0, electrons)));
  const saturation = toFiniteNumber(det.saturationElectrons, Number.NaN);
  return Number.isFinite(saturation) && saturation > 0 ? Math.min(electrons, saturation) : electrons;
};
