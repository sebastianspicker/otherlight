import { clamp, toFiniteNumber, toFiniteNonNeg } from "../core/units";
import {
  normal as normalSample,
  ouStep,
  poisson as poissonSample,
  randomWalkStep,
  type PRNG as PRNGPublic,
} from "./random";
import type { InstrumentNoiseState, InstrumentNoiseSystematicsParams } from "./instrumentNoise";

type OneOverFCfg = NonNullable<NonNullable<InstrumentNoiseSystematicsParams["correlatedNoise"]>["oneOverF"]>;

function makeOneOverFSignature(cfg: OneOverFCfg): string {
  const n = Math.max(1, Math.floor(toFiniteNumber(cfg.nComponents, 6)));
  const tauMin = toFiniteNumber(cfg.tauMinSec, 10);
  const tauMax = toFiniteNumber(cfg.tauMaxSec, 10_000);
  const sigma = toFiniteNumber(cfg.sigmaFlux, 0);
  return `${n}|${tauMin}|${tauMax}|${sigma}`;
}

export function ensureOneOverFBank(state: InstrumentNoiseState, oneF: OneOverFCfg): void {
  const sig = makeOneOverFSignature(oneF);
  if (state.ar1Bank && state.oneOverFSignature === sig) return;

  const n = Math.max(1, Math.floor(toFiniteNumber(oneF.nComponents, 6)));
  const tauMin = Math.max(1e-6, toFiniteNumber(oneF.tauMinSec, 10));
  const tauMax = Math.max(tauMin, toFiniteNumber(oneF.tauMaxSec, 10_000));
  const sigmaTotal = Math.max(0, toFiniteNumber(oneF.sigmaFlux, 0));
  const w = sigmaTotal / Math.sqrt(n);
  const logMin = Math.log(tauMin);
  const logMax = Math.log(tauMax);

  const bank: Array<{ x: number; tau: number; weight: number }> = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1);
    const tau = Math.exp(logMin + f * (logMax - logMin));
    bank.push({ x: 0, tau, weight: w });
  }

  state.ar1Bank = bank;
  state.oneOverFSignature = sig;
}

export function computeDt(tSec: number, dtSec: unknown, lastT: number | undefined): number {
  if (typeof dtSec === "number" && Number.isFinite(dtSec) && dtSec > 0) return dtSec;
  if (typeof lastT === "number" && Number.isFinite(lastT)) return Math.max(0, tSec - lastT);
  return 0;
}

export function currentAirmass(
  cfg: NonNullable<InstrumentNoiseSystematicsParams["observer"]>["atmosphere"],
  tSec: number,
): number {
  const air = cfg?.airmass;
  if (!air?.enabled) return 1;
  const base = Math.max(1, toFiniteNumber(air.base, 1));
  const linear = toFiniteNumber(air.linearPerSec, 0);
  const curvature = toFiniteNumber(air.curvaturePerSec2, 0);
  const min = Math.max(1, toFiniteNumber(air.min, 1));
  const max = Math.max(min, toFiniteNumber(air.max, 3));
  const raw = base + linear * tSec + curvature * tSec * tSec;
  return clamp(raw, min, max);
}

export function sampleElectrons(
  meanElectrons: number,
  cfg: InstrumentNoiseSystematicsParams["photonNoise"] | undefined,
  rngOwner: { rng: PRNGPublic },
): number {
  const mean = Math.max(0, meanElectrons);
  if (!cfg?.enabled) return mean;
  const gaussThresh = Math.max(0, toFiniteNumber(cfg.gaussianApproxMinElectrons, 50));
  if (mean >= gaussThresh) return normalSample(rngOwner.rng, mean, Math.sqrt(mean));
  return poissonSample(rngOwner.rng, mean);
}

export function isGapSample(cfg: InstrumentNoiseSystematicsParams["observer"], tSec: number): boolean {
  if (!cfg?.enabled) return false;
  const gaps = cfg.dataGaps;
  if (!gaps?.enabled) return false;

  if (Array.isArray(gaps.windowsSec)) {
    for (const window of gaps.windowsSec) {
      const start = toFiniteNumber(window.startSec, Number.NaN);
      const end = toFiniteNumber(window.endSec, Number.NaN);
      if (Number.isFinite(start) && Number.isFinite(end) && tSec >= start && tSec <= end) return true;
    }
  }

  const periodic = gaps.periodic;
  if (!periodic?.enabled) return false;
  const periodSec = toFiniteNumber(periodic.periodSec, Number.NaN);
  const gapDurationSec = Math.max(0, toFiniteNumber(periodic.gapDurationSec, 0));
  if (!(Number.isFinite(periodSec) && periodSec > 0 && gapDurationSec > 0)) return false;
  const phaseSec = toFiniteNumber(periodic.phaseSec, 0);
  const phase = (((tSec - phaseSec) % periodSec) + periodSec) % periodSec;
  return phase <= gapDurationSec;
}

export function applyDetrend(
  flux: number,
  tSec: number,
  cfg: InstrumentNoiseSystematicsParams["postprocess"],
  state: InstrumentNoiseState,
): number {
  if (!(cfg?.enabled && cfg.detrend?.enabled) || !Number.isFinite(flux)) return flux;

  const detrend = cfg.detrend;
  const windowSec = Math.max(1, toFiniteNumber(detrend.windowSec, 1800));
  const minSamples = Math.max(2, Math.floor(toFiniteNumber(detrend.minSamples, 5)));
  const maxHistorySamples = Math.max(minSamples, Math.floor(toFiniteNumber(detrend.maxHistorySamples, 256)));
  const preserveBaseline = detrend.preserveBaseline !== false;

  const history = [...(state.detrendHistory ?? [])].filter(
    (sample) =>
      Number.isFinite(sample.tSec) && Number.isFinite(sample.flux) && tSec - sample.tSec <= windowSec,
  );
  history.push({ tSec, flux });
  while (history.length > maxHistorySamples) history.shift();
  state.detrendHistory = history;

  if (history.length < minSamples) return flux;

  if (detrend.mode === "running-mean") {
    const baseline = history.reduce((sum, sample) => sum + sample.flux, 0) / history.length;
    return preserveBaseline ? flux - baseline + 1 : flux - baseline;
  }

  const meanT = history.reduce((sum, sample) => sum + sample.tSec, 0) / history.length;
  const meanF = history.reduce((sum, sample) => sum + sample.flux, 0) / history.length;
  let cov = 0;
  let varT = 0;
  for (const sample of history) {
    const dt = sample.tSec - meanT;
    cov += dt * (sample.flux - meanF);
    varT += dt * dt;
  }
  const slope = varT > 0 ? cov / varT : 0;
  const baseline = meanF + slope * (tSec - meanT);
  return preserveBaseline ? flux - baseline + 1 : flux - baseline;
}

/**
 * Computes the additive deterministic systematics term (roll, temperature, intra-pixel,
 * drift families). Mutates `state.tempRW` if the temperature random-walk component is active.
 * Returns the total additive offset in flux units.
 */
export function applyDeterministicSystematics(
  state: InstrumentNoiseState,
  trends: InstrumentNoiseSystematicsParams["trends"],
  t: number,
  dt: number,
): number {
  if (!trends?.enabled) return 0;
  let sysFluxAdd = 0;

  const roll = trends.roll;
  if (roll?.enabled) {
    const amp = toFiniteNumber(roll.ampFlux, 0);
    const P = toFiniteNumber(roll.periodSec, NaN);
    const phi0 = toFiniteNumber(roll.phase0, 0);
    if (Number.isFinite(P) && P > 0 && Number.isFinite(amp) && amp !== 0) {
      const phi = (2 * Math.PI * t) / P + phi0;
      sysFluxAdd += amp * Math.sin(phi);
    }
  }

  const temp = trends.temperature;
  if (temp?.enabled) {
    const slope = toFiniteNumber(temp.linearSlopeFluxPerSec, 0);
    if (Number.isFinite(slope) && slope !== 0) sysFluxAdd += slope * t;
    const rwSigma = Math.max(0, toFiniteNumber(temp.randomWalkSigmaFluxPerSqrtSec, 0));
    if (rwSigma > 0 && dt > 0) {
      const next = randomWalkStep(state.rng, state.tempRW ?? 0, dt, rwSigma);
      state.tempRW = Number.isFinite(next) ? next : (state.tempRW ?? 0);
    } else if (rwSigma > 0 && dt === 0 && state.tempRW === undefined) {
      state.tempRW = 0;
    }
    sysFluxAdd += state.tempRW ?? 0;
  }

  const ip = trends.intraPixel;
  if (ip?.enabled) {
    const amp = toFiniteNumber(ip.ampFlux, 0);
    const ax = toFiniteNumber(ip.ax, 0);
    const ay = toFiniteNumber(ip.ay, 0);
    const Px = toFiniteNumber(ip.periodXSec, NaN);
    const Py = toFiniteNumber(ip.periodYSec, NaN);
    const phaseY = toFiniteNumber(ip.phaseY, 0);
    if (Number.isFinite(amp) && amp !== 0 && Number.isFinite(Px) && Px > 0 && Number.isFinite(Py) && Py > 0) {
      const x = ax * Math.sin((2 * Math.PI * t) / Px);
      const y = ay * Math.sin((2 * Math.PI * t) / Py + phaseY);
      sysFluxAdd += amp * 0.5 * Math.cos(2 * Math.PI * x) * Math.cos(2 * Math.PI * y);
    }
  }

  const drift = trends.driftFamilies;
  if (drift?.enabled) {
    const amps = Array.isArray(drift.amplitudesFlux) ? drift.amplitudesFlux : [];
    const periods = Array.isArray(drift.periodsSec) ? drift.periodsSec : [];
    const phases = Array.isArray(drift.phasesRad) ? drift.phasesRad : [];
    const n = Math.min(amps.length, periods.length);
    for (let i = 0; i < n; i++) {
      const a = toFiniteNumber(amps[i], 0);
      const p = toFiniteNumber(periods[i], NaN);
      const ph = toFiniteNumber(phases[i], 0);
      if (!(Number.isFinite(a) && a !== 0 && Number.isFinite(p) && p > 0)) continue;
      sysFluxAdd += a * Math.sin((2 * Math.PI * t) / p + ph);
    }
  }

  return sysFluxAdd;
}

/**
 * Advances correlated-noise state (AR1 + 1/f bank) by `dt` seconds and returns the
 * additive correlated-noise term in flux units. Clears the bank when the 1/f feature
 * is toggled off, so re-enabling starts from a fresh state.
 */
export function applyCorrelatedNoise(
  state: InstrumentNoiseState,
  correlatedNoise: InstrumentNoiseSystematicsParams["correlatedNoise"],
  dt: number,
): number {
  const sigma = Math.max(0, toFiniteNumber(correlatedNoise?.sigmaFlux, 0));
  const tau = Math.max(1e-6, toFiniteNumber(correlatedNoise?.tauSec, 100));
  let corrFluxAdd = 0;

  state.ar1 = state.ar1 ?? { x: 0 };
  if (sigma > 0 && dt > 0) {
    const xNew = ouStep(state.rng, state.ar1.x, dt, tau, sigma);
    state.ar1.x = Number.isFinite(xNew) ? xNew : state.ar1.x;
  }
  if (sigma > 0) corrFluxAdd += state.ar1.x;

  const oneF = correlatedNoise?.oneOverF;
  if (oneF?.enabled) {
    ensureOneOverFBank(state, oneF);
    if (state.ar1Bank && dt > 0) {
      for (const comp of state.ar1Bank) {
        const cx = ouStep(state.rng, comp.x, dt, comp.tau, comp.weight);
        comp.x = Number.isFinite(cx) ? cx : comp.x;
        corrFluxAdd += comp.x;
      }
    } else if (state.ar1Bank) {
      for (const comp of state.ar1Bank) corrFluxAdd += comp.x;
    }
  } else {
    state.ar1Bank = undefined;
    state.oneOverFSignature = undefined;
  }

  return corrFluxAdd;
}

/**
 * Applies detector flux-domain effects (PRNU, jitter) and observer-atmosphere transmission
 * to `fluxPreNoise`. Draws from `state.rng` for detector and scintillation noise even when
 * those effects are disabled to keep the PRNG stream deterministic. Returns the modified flux.
 */
export function applyFluxDomainEffects(
  state: InstrumentNoiseState,
  cfg: InstrumentNoiseSystematicsParams,
  fluxPreNoise: number,
  t: number,
  dt: number,
): number {
  let flux = fluxPreNoise;
  const det = cfg.detector;
  if (det?.enabled) {
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
  }

  const observer = cfg.observer;
  const atmosphere = observer?.atmosphere;
  const airmass = currentAirmass(atmosphere, t);
  let transmission = 1;

  if (observer?.enabled && atmosphere?.enabled) {
    const extinctionCoeff = Math.max(0, toFiniteNumber(atmosphere.airmass?.extinctionCoeff, 0));
    if (extinctionCoeff > 0) transmission *= Math.exp(-extinctionCoeff * airmass);

    const clouds = atmosphere.clouds;
    if (clouds?.enabled) {
      const meanTau = Math.max(0, toFiniteNumber(clouds.meanOpticalDepth, 0));
      const sigmaTau = Math.max(0, toFiniteNumber(clouds.sigmaOpticalDepth, 0));
      const tauSec = Math.max(1e-6, toFiniteNumber(clouds.tauSec, 900));
      if (sigmaTau > 0 && dt > 0)
        state.observerCloudTau = ouStep(state.rng, state.observerCloudTau ?? 0, dt, tauSec, sigmaTau);
      transmission *= Math.exp(-Math.max(0, meanTau + (state.observerCloudTau ?? 0)) * airmass);
    }

    const tellurics = atmosphere.tellurics;
    if (tellurics?.enabled) {
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
      transmission *= Math.exp(-tau);
    }

    const seeing = atmosphere.seeing;
    if (seeing?.enabled) {
      const meanLoss = Math.max(0, toFiniteNumber(seeing.meanLoss, 0));
      const sigmaLoss = Math.max(0, toFiniteNumber(seeing.sigmaLoss, 0));
      const tauSec = Math.max(1e-6, toFiniteNumber(seeing.tauSec, 600));
      if (sigmaLoss > 0 && dt > 0)
        state.observerSeeingLoss = ouStep(state.rng, state.observerSeeingLoss ?? 0, dt, tauSec, sigmaLoss);
      const airmassExponent = Math.max(0, toFiniteNumber(seeing.airmassExponent, 0));
      const maxLoss = clamp(toFiniteNumber(seeing.maxLoss, 0.9), 0, 0.99);
      const lossRaw = (meanLoss + (state.observerSeeingLoss ?? 0)) * Math.max(1, airmass ** airmassExponent);
      transmission *= Math.max(0, 1 - clamp(lossRaw, 0, maxLoss));
    }

    const scintillation = atmosphere.scintillation;
    if (scintillation?.enabled) {
      const sigmaFlux = Math.max(0, toFiniteNumber(scintillation.sigmaFlux, 0));
      const airmassExponent = Math.max(0, toFiniteNumber(scintillation.airmassExponent, 1.5));
      const exposureExponent = Math.max(0, toFiniteNumber(scintillation.exposureExponent, 0.5));
      const exposureScale = Math.max(1e-6, toFiniteNonNeg(cfg.exposureSec, 1));
      const sigma =
        (sigmaFlux * Math.max(1, airmass ** airmassExponent)) /
        Math.max(1, exposureScale ** exposureExponent);
      transmission *= Math.max(0, 1 + normalSample(state.rng, 0, sigma));
    }
  }

  return flux * transmission;
}

/**
 * Converts `fluxPreNoise` to electrons, applies photon noise, read noise, and post-electron
 * detector effects (nonlinearity, CTI, saturation), then converts back to flux units.
 * Returns `fluxPreNoise` unchanged when electron noise is not applicable.
 */
export function applyElectronNoise(
  state: InstrumentNoiseState,
  cfg: InstrumentNoiseSystematicsParams,
  fluxPreNoise: number,
): number {
  const throughput = toFiniteNonNeg(cfg.throughput, 1);
  const ePerFluxPerSec = Math.max(0, toFiniteNumber(cfg.electronsPerUnitFlux, 1e6));
  const exposureSec = toFiniteNonNeg(cfg.exposureSec, 0);
  if (!(exposureSec > 0 && ePerFluxPerSec > 0 && throughput > 0)) return fluxPreNoise;

  const observer = cfg.observer;
  const atmosphere = observer?.enabled ? observer.atmosphere : undefined;
  const skyCfg = atmosphere?.enabled ? atmosphere.skyBackground : undefined;
  const meanElectrons = Math.max(0, fluxPreNoise) * throughput * ePerFluxPerSec * exposureSec;
  const meanSkyElectrons =
    skyCfg?.enabled && exposureSec > 0
      ? Math.max(0, toFiniteNumber(skyCfg.electronsPerSec, 0)) * exposureSec
      : 0;
  const skyResidualFraction = clamp(toFiniteNumber(skyCfg?.subtractionResidualFraction, 0), 0, 1);

  let electrons = meanElectrons;
  if (cfg.photonNoise?.enabled || meanSkyElectrons > 0) {
    const sourceElectrons = sampleElectrons(meanElectrons, cfg.photonNoise, state);
    const skyElectrons = sampleElectrons(meanSkyElectrons, cfg.photonNoise, state);
    electrons = sourceElectrons + (skyElectrons - meanSkyElectrons) + meanSkyElectrons * skyResidualFraction;
  }

  if (cfg.readNoise?.enabled) {
    const s = toFiniteNonNeg(cfg.readNoise.sigmaElectrons, 0);
    if (s > 0) electrons += normalSample(state.rng, 0, s);
  }

  const det = cfg.detector;
  if (det?.enabled) {
    const nonlin = Math.max(0, toFiniteNumber(det.nonlinearityCoeff, 0));
    if (nonlin > 0) electrons = Math.max(0, electrons * (1 - nonlin * Math.max(0, electrons)));
    const cti = Math.max(0, toFiniteNumber(det.ctiTrailCoeff, 0));
    if (cti > 0) electrons = Math.max(0, electrons - cti * Math.sqrt(Math.max(0, electrons)));
    const sat = toFiniteNumber(det.saturationElectrons, Number.NaN);
    if (Number.isFinite(sat) && sat > 0) electrons = Math.min(electrons, sat);
  }

  const denom = throughput * ePerFluxPerSec * exposureSec;
  return denom > 0 ? electrons / denom : fluxPreNoise;
}
