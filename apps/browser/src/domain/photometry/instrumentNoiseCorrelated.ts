/** Applies correlated one-over-f instrument noise systematics. */
import { toFiniteNumber } from "../model/units";
import { ouStep } from "./random";
import type { InstrumentNoiseState, InstrumentNoiseSystematicsParams } from "./instrumentNoiseTypes";

type OneOverFCfg = NonNullable<NonNullable<InstrumentNoiseSystematicsParams["correlatedNoise"]>["oneOverF"]>;
type OneOverFConfig = NonNullable<InstrumentNoiseSystematicsParams["correlatedNoise"]>["oneOverF"];

const makeOneOverFSignature = (cfg: OneOverFCfg): string => {
  const n = Math.max(1, Math.floor(toFiniteNumber(cfg.nComponents, 6)));
  const tauMin = toFiniteNumber(cfg.tauMinSec, 10);
  const tauMax = toFiniteNumber(cfg.tauMaxSec, 10_000);
  const sigma = toFiniteNumber(cfg.sigmaFlux, 0);
  return `${n}|${tauMin}|${tauMax}|${sigma}`;
};

export function ensureOneOverFBank(state: InstrumentNoiseState, oneF: OneOverFCfg): void {
  const signature = makeOneOverFSignature(oneF);
  if (state.ar1Bank && state.oneOverFSignature === signature) return;
  const n = Math.max(1, Math.floor(toFiniteNumber(oneF.nComponents, 6)));
  const tauMin = Math.max(1e-6, toFiniteNumber(oneF.tauMinSec, 10));
  const tauMax = Math.max(tauMin, toFiniteNumber(oneF.tauMaxSec, 10_000));
  const weight = Math.max(0, toFiniteNumber(oneF.sigmaFlux, 0)) / Math.sqrt(n);
  const logMin = Math.log(tauMin);
  const logMax = Math.log(tauMax);
  const bank: Array<{ x: number; tau: number; weight: number }> = [];
  for (let i = 0; i < n; i++) {
    const fraction = n === 1 ? 0 : i / (n - 1);
    bank.push({ x: 0, tau: Math.exp(logMin + fraction * (logMax - logMin)), weight });
  }
  state.ar1Bank = bank;
  state.oneOverFSignature = signature;
}

export function applyCorrelatedNoise(
  state: InstrumentNoiseState,
  correlatedNoise: InstrumentNoiseSystematicsParams["correlatedNoise"],
  dt: number,
): number {
  const sigma = Math.max(0, toFiniteNumber(correlatedNoise?.sigmaFlux, 0));
  const tau = Math.max(1e-6, toFiniteNumber(correlatedNoise?.tauSec, 100));
  return stepAr1Noise(state, sigma, tau, dt) + oneOverFNoise(state, correlatedNoise?.oneOverF, dt);
}

const stepAr1Noise = (state: InstrumentNoiseState, sigma: number, tau: number, dt: number): number => {
  state.ar1 = state.ar1 ?? { x: 0 };
  if (sigma > 0 && dt > 0) {
    const next = ouStep(state.rng, state.ar1.x, dt, tau, sigma);
    state.ar1.x = Number.isFinite(next) ? next : state.ar1.x;
  }
  return sigma > 0 ? state.ar1.x : 0;
};

const oneOverFNoise = (state: InstrumentNoiseState, oneF: OneOverFConfig, dt: number): number => {
  if (!oneF?.enabled) {
    state.ar1Bank = undefined;
    state.oneOverFSignature = undefined;
    return 0;
  }
  ensureOneOverFBank(state, oneF);
  let fluxAdd = 0;
  for (const component of state.ar1Bank ?? []) {
    if (dt > 0) {
      const next = ouStep(state.rng, component.x, dt, component.tau, component.weight);
      component.x = Number.isFinite(next) ? next : component.x;
    }
    fluxAdd += component.x;
  }
  return fluxAdd;
};
