import { clamp, toFiniteNumber } from "../core/units";
import { normal as normalSample, poisson as poissonSample, type PRNG as PRNGPublic } from "./random";
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
