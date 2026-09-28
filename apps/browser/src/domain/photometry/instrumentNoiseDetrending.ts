/** Provides observer-gap timing and rolling detrending for instrument noise. */
import { toFiniteNumber } from "../model/units";
import type { InstrumentNoiseState, InstrumentNoiseSystematicsParams } from "./instrumentNoiseTypes";

type ObserverConfig = NonNullable<InstrumentNoiseSystematicsParams["observer"]>;
type DataGapsConfig = NonNullable<ObserverConfig["dataGaps"]>;

export function computeDt(tSec: number, dtSec: unknown, lastT: number | undefined): number {
  if (typeof dtSec === "number" && Number.isFinite(dtSec) && dtSec > 0) return dtSec;
  if (typeof lastT === "number" && Number.isFinite(lastT)) return Math.max(0, tSec - lastT);
  return 0;
}

export function isGapSample(cfg: InstrumentNoiseSystematicsParams["observer"], tSec: number): boolean {
  if (!cfg?.enabled) return false;
  const gaps = cfg.dataGaps;
  if (!gaps?.enabled) return false;
  if (isInConfiguredGapWindow(gaps.windowsSec, tSec)) return true;
  return isInPeriodicGap(gaps.periodic, tSec);
}

const isInConfiguredGapWindow = (windowsSec: DataGapsConfig["windowsSec"], tSec: number): boolean => {
  if (!Array.isArray(windowsSec)) return false;
  return windowsSec.some((window) => {
    const start = toFiniteNumber(window.startSec, Number.NaN);
    const end = toFiniteNumber(window.endSec, Number.NaN);
    return Number.isFinite(start) && Number.isFinite(end) && tSec >= start && tSec <= end;
  });
};

const isInPeriodicGap = (periodic: DataGapsConfig["periodic"], tSec: number): boolean => {
  if (!periodic?.enabled) return false;
  const periodSec = toFiniteNumber(periodic.periodSec, Number.NaN);
  const gapDurationSec = Math.max(0, toFiniteNumber(periodic.gapDurationSec, 0));
  if (!(Number.isFinite(periodSec) && periodSec > 0 && gapDurationSec > 0)) return false;
  const phaseSec = toFiniteNumber(periodic.phaseSec, 0);
  const phase = (((tSec - phaseSec) % periodSec) + periodSec) % periodSec;
  return phase <= gapDurationSec;
};

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
  const history = updateDetrendHistory(state, { tSec, flux, windowSec, maxHistorySamples });
  if (history.length < minSamples) return flux;
  const baseline =
    detrend.mode === "running-mean" ? runningMeanFlux(history) : linearDetrendBaseline(history, tSec);
  return preserveBaseline ? flux - baseline + 1 : flux - baseline;
}

const updateDetrendHistory = (
  state: InstrumentNoiseState,
  args: { tSec: number; flux: number; windowSec: number; maxHistorySamples: number },
): Array<{ tSec: number; flux: number }> => {
  const history = [...(state.detrendHistory ?? [])].filter(
    (sample) =>
      Number.isFinite(sample.tSec) &&
      Number.isFinite(sample.flux) &&
      args.tSec - sample.tSec <= args.windowSec,
  );
  history.push({ tSec: args.tSec, flux: args.flux });
  while (history.length > args.maxHistorySamples) history.shift();
  state.detrendHistory = history;
  return history;
};

const runningMeanFlux = (history: Array<{ tSec: number; flux: number }>): number =>
  history.reduce((sum, sample) => sum + sample.flux, 0) / history.length;

const linearDetrendBaseline = (history: Array<{ tSec: number; flux: number }>, tSec: number): number => {
  const meanT = history.reduce((sum, sample) => sum + sample.tSec, 0) / history.length;
  const meanF = runningMeanFlux(history);
  let cov = 0;
  let varT = 0;
  for (const sample of history) {
    const dt = sample.tSec - meanT;
    cov += dt * (sample.flux - meanF);
    varT += dt * dt;
  }
  const slope = varT > 0 ? cov / varT : 0;
  return meanF + slope * (tSec - meanT);
};
