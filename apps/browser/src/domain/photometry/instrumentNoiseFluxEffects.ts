/** Applies detector and atmospheric flux-domain noise effects. */
import { clamp, toFiniteNonNeg, toFiniteNumber } from "../model/units";
import { normal as normalSample, ouStep } from "./random";
import type { InstrumentNoiseState, InstrumentNoiseSystematicsParams } from "./instrumentNoiseTypes";

type AtmosphereConfig = NonNullable<NonNullable<InstrumentNoiseSystematicsParams["observer"]>["atmosphere"]>;
type ObserverAtmosphere = NonNullable<InstrumentNoiseSystematicsParams["observer"]>["atmosphere"];

export function applyFluxDomainEffects(
  state: InstrumentNoiseState,
  cfg: InstrumentNoiseSystematicsParams,
  fluxPreNoise: number,
  t: number,
  dt: number,
): number {
  const flux = applyDetectorFluxEffects(state, cfg.detector, fluxPreNoise);
  const atmosphere = cfg.observer?.atmosphere;
  const airmass = currentAirmass(atmosphere, t);
  const transmission =
    cfg.observer?.enabled && atmosphere?.enabled
      ? observerAtmosphereTransmission(state, cfg, atmosphere, airmass, dt)
      : 1;
  return flux * transmission;
}

const applyDetectorFluxEffects = (
  state: InstrumentNoiseState,
  det: InstrumentNoiseSystematicsParams["detector"],
  fluxPreNoise: number,
): number => {
  if (!det?.enabled) return fluxPreNoise;
  let flux = fluxPreNoise;
  const prnuDraw = normalSample(state.rng, 0, 1);
  const jitterDrawX = normalSample(state.rng, 0, 1);
  const jitterDrawY = normalSample(state.rng, 0, 1);
  const prnuSigma = Math.max(0, toFiniteNumber(det.prnuSigma, 0));
  if (prnuSigma > 0) flux *= Math.max(0, 1 + prnuDraw * prnuSigma);
  const jitterSigmaPx = Math.max(0, toFiniteNumber(det.jitterSigmaPx, 0));
  if (jitterSigmaPx > 0) {
    const jx = jitterDrawX * jitterSigmaPx;
    const jy = jitterDrawY * jitterSigmaPx;
    flux *= Math.max(0, 1 - 0.02 * (jx * jx + jy * jy));
  }
  return flux;
};

export function currentAirmass(atmosphere: ObserverAtmosphere, tSec: number): number {
  const air = atmosphere?.airmass;
  if (!air?.enabled) return 1;
  const base = Math.max(1, toFiniteNumber(air.base, 1));
  const linear = toFiniteNumber(air.linearPerSec, 0);
  const curvature = toFiniteNumber(air.curvaturePerSec2, 0);
  const min = Math.max(1, toFiniteNumber(air.min, 1));
  const max = Math.max(min, toFiniteNumber(air.max, 3));
  const raw = base + linear * tSec + curvature * tSec * tSec;
  return clamp(raw, min, max);
}

const observerAtmosphereTransmission = (
  state: InstrumentNoiseState,
  cfg: InstrumentNoiseSystematicsParams,
  atmosphere: AtmosphereConfig,
  airmass: number,
  dt: number,
): number => {
  let transmission = extinctionTransmission(atmosphere, airmass);
  transmission *= cloudTransmission(state, atmosphere.clouds, airmass, dt);
  transmission *= telluricTransmission(state, atmosphere.tellurics, airmass, dt);
  transmission *= seeingTransmission(state, atmosphere.seeing, airmass, dt);
  transmission *= scintillationTransmission(state, atmosphere.scintillation, cfg.exposureSec, airmass);
  return transmission;
};

const extinctionTransmission = (atmosphere: AtmosphereConfig, airmass: number): number => {
  const coefficient = Math.max(0, toFiniteNumber(atmosphere.airmass?.extinctionCoeff, 0));
  return coefficient > 0 ? Math.exp(-coefficient * airmass) : 1;
};

const cloudTransmission = (
  state: InstrumentNoiseState,
  clouds: AtmosphereConfig["clouds"],
  airmass: number,
  dt: number,
): number => {
  if (!clouds?.enabled) return 1;
  const meanTau = Math.max(0, toFiniteNumber(clouds.meanOpticalDepth, 0));
  const sigmaTau = Math.max(0, toFiniteNumber(clouds.sigmaOpticalDepth, 0));
  const tauSec = Math.max(1e-6, toFiniteNumber(clouds.tauSec, 900));
  if (sigmaTau > 0 && dt > 0)
    state.observerCloudTau = ouStep(state.rng, state.observerCloudTau ?? 0, dt, tauSec, sigmaTau);
  return Math.exp(-Math.max(0, meanTau + (state.observerCloudTau ?? 0)) * airmass);
};

const telluricTransmission = (
  state: InstrumentNoiseState,
  tellurics: AtmosphereConfig["tellurics"],
  airmass: number,
  dt: number,
): number => {
  if (!tellurics?.enabled) return 1;
  const meanTau = Math.max(0, toFiniteNumber(tellurics.meanOpticalDepth, 0));
  const sigmaTau = Math.max(0, toFiniteNumber(tellurics.sigmaOpticalDepth, 0));
  const tauSec = Math.max(1e-6, toFiniteNumber(tellurics.tauSec, 1200));
  if (sigmaTau > 0 && dt > 0)
    state.observerTelluricTau = ouStep(state.rng, state.observerTelluricTau ?? 0, dt, tauSec, sigmaTau);
  const airmassCoupling = Math.max(0, toFiniteNumber(tellurics.airmassCoupling, 0));
  const tau = Math.max(
    0,
    meanTau + (state.observerTelluricTau ?? 0) + airmassCoupling * Math.max(0, airmass - 1),
  );
  return Math.exp(-tau);
};

const seeingTransmission = (
  state: InstrumentNoiseState,
  seeing: AtmosphereConfig["seeing"],
  airmass: number,
  dt: number,
): number => {
  if (!seeing?.enabled) return 1;
  const meanLoss = Math.max(0, toFiniteNumber(seeing.meanLoss, 0));
  const sigmaLoss = Math.max(0, toFiniteNumber(seeing.sigmaLoss, 0));
  const tauSec = Math.max(1e-6, toFiniteNumber(seeing.tauSec, 600));
  if (sigmaLoss > 0 && dt > 0)
    state.observerSeeingLoss = ouStep(state.rng, state.observerSeeingLoss ?? 0, dt, tauSec, sigmaLoss);
  const airmassExponent = Math.max(0, toFiniteNumber(seeing.airmassExponent, 0));
  const maxLoss = clamp(toFiniteNumber(seeing.maxLoss, 0.9), 0, 0.99);
  const lossRaw = (meanLoss + (state.observerSeeingLoss ?? 0)) * Math.max(1, airmass ** airmassExponent);
  return Math.max(0, 1 - clamp(lossRaw, 0, maxLoss));
};

const scintillationTransmission = (
  state: InstrumentNoiseState,
  scintillation: AtmosphereConfig["scintillation"],
  exposureSec: number | undefined,
  airmass: number,
): number => {
  if (!scintillation?.enabled) return 1;
  const sigmaFlux = Math.max(0, toFiniteNumber(scintillation.sigmaFlux, 0));
  const airmassExponent = Math.max(0, toFiniteNumber(scintillation.airmassExponent, 1.5));
  const exposureExponent = Math.max(0, toFiniteNumber(scintillation.exposureExponent, 0.5));
  const exposureScale = Math.max(1e-6, toFiniteNonNeg(exposureSec, 1));
  const sigma =
    (sigmaFlux * Math.max(1, airmass ** airmassExponent)) / Math.max(1, exposureScale ** exposureExponent);
  return Math.max(0, 1 + normalSample(state.rng, 0, sigma));
};
