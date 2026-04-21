// src/photometry/instrumentNoise.ts

//
// Instrument noise + systematics measurement layer.
//
// Intended usage (main.ts):
// 1) compute physical flux (optionally smeared)
// 2) pass to applyInstrumentNoiseAndSystematics(...)
//
// Determinism:
// - Deterministic if a seed is fixed and state is preserved across samples.
//
// Contract (important for UI + tests):
// - If cfg.enabled is false OR cfg missing: return input flux unchanged (no-op) and do NOT mutate state.
// - If inputs are non-finite (flux or tSec): return input flux unchanged (no throw).
// - dtSec handling:
//     - If dtSec provided and finite > 0: use it.
//     - Else infer dt = tSec - state.lastT when available; if unavailable or negative => dt = 0.
// - Correlated components (OU and 1/f bank):
//     - Updated only when dt > 0.
//     - When a correlated feature is disabled, its internal state is reset so that re-enabling starts fresh.
// - Flux -> electrons conversion:
//     meanElectrons = flux * throughput * electronsPerUnitFlux * exposureSec
//     (electronsPerUnitFlux has units e- / (flux_unit * s); exposureSec is seconds)
// - Negative flux before conversion:
//     - For Poisson mean, negative is clamped to 0.
//     - Deterministic additive systematics/correlated terms may drive fluxPreNoise negative.
// - Must never throw for normal invalid UI inputs; treat as safe no-op and return input flux.

import { clamp, toFiniteNumber } from "../core/units";
import { createMulberry32, type PRNG as PRNGPublic } from "./random";
import {
  applyDetrend,
  applyCorrelatedNoise,
  applyDeterministicSystematics,
  applyElectronNoise,
  applyFluxDomainEffects,
  computeDt,
  isGapSample,
} from "./instrumentNoiseHelpers";

// NOTE: Type lives in core to avoid core -> photometry dependency cycles.
// Keep re-export for backwards compatibility with existing imports.
import type { InstrumentNoiseSystematicsParams } from "../core/instrumentNoiseTypes";
export type { InstrumentNoiseSystematicsParams } from "../core/instrumentNoiseTypes";

export type InstrumentNoiseState = {
  /** Seed used to (re-)initialize the RNG when requested. */
  seed: number;
  rng: PRNGPublic;
  /** Last sample time [s] seen by applyInstrumentNoiseAndSystematics(). */
  lastT?: number;
  /** OU/AR(1) red-noise state (flux units). */
  ar1?: { x: number };
  /** 1/f-ish OU bank states. */
  ar1Bank?: Array<{ x: number; tau: number; weight: number }>;
  /** Temperature random-walk state (flux units). */
  tempRW?: number;
  /** Cached config signature for rebuilding OU bank when user changes settings. */
  oneOverFSignature?: string;
  /** Track last correlated-enabled and temperature-enabled for reset-on-disable behavior. */
  _wasCorrelatedEnabled?: boolean;
  _wasTempEnabled?: boolean;
  /** Observer-atmosphere OU state for cloud optical-depth fluctuations. */
  observerCloudTau?: number;
  /** Observer-atmosphere OU state for seeing-loss fluctuations. */
  observerSeeingLoss?: number;
  /** Observer-atmosphere OU state for telluric optical-depth fluctuations. */
  observerTelluricTau?: number;
  /** Measured-flux history for bounded detrending. */
  detrendHistory?: Array<{ tSec: number; flux: number }>;
};

export function createInstrumentNoiseState(seed = 1): InstrumentNoiseState {
  const rng = createMulberry32(seed);
  return {
    seed,
    rng,
    lastT: undefined,
    ar1: { x: 0 },
    ar1Bank: undefined,
    tempRW: 0,
    oneOverFSignature: undefined,
    _wasCorrelatedEnabled: undefined,
    _wasTempEnabled: undefined,
    observerCloudTau: 0,
    observerSeeingLoss: 0,
    observerTelluricTau: 0,
    detrendHistory: [],
  };
}

/**
 * Reset time/correlation/trend memory so that a new time series starts cleanly.
 * This is useful on UI reset/seek, or whenever the time axis is discontinuous.
 */
export function resetInstrumentNoiseState(
  state: InstrumentNoiseState,
  opts?: { resetRng?: boolean; seed?: number },
): void {
  const nextSeedRaw = opts?.seed;
  const nextSeed = typeof nextSeedRaw === "number" && Number.isFinite(nextSeedRaw) ? nextSeedRaw : state.seed;
  state.seed = nextSeed;

  if (opts?.resetRng) state.rng = createMulberry32(nextSeed);

  state.lastT = undefined;
  state.ar1 = state.ar1 ?? { x: 0 };
  state.ar1.x = 0;
  state.ar1Bank = undefined;
  state.oneOverFSignature = undefined;
  state.tempRW = 0;
  state._wasCorrelatedEnabled = undefined;
  state._wasTempEnabled = undefined;
  state.observerCloudTau = 0;
  state.observerSeeingLoss = 0;
  state.observerTelluricTau = 0;
  state.detrendHistory = [];
}

/**
 * Apply instrument noise + systematics to a (smeared or instantaneous) flux sample.
 * This mutates `state` to keep time correlation and random walks continuous.
 */
export function applyInstrumentNoiseAndSystematics(args: {
  flux: number; // physical/smeared flux in stellar units
  tSec: number;
  dtSec?: number; // if omitted we infer from state.lastT
  cfg?: InstrumentNoiseSystematicsParams;
  state: InstrumentNoiseState;
  /**
   * Optional: reset state if the time axis jumps (e.g. reset/seek).
   * - true: reset on backward time jumps (t < lastT).
   * - object: can also request RNG reset for reproducible restarts.
   */
  resetOnTimeJump?: boolean | { enabled?: boolean; resetRng?: boolean };
}): number {
  const cfg = args.cfg;
  // Contract: no cfg or disabled => strict no-op, no state mutation.
  if (!cfg?.enabled) return args.flux;

  const fluxIn = args.flux;
  const t = args.tSec;

  if (!Number.isFinite(fluxIn) || !Number.isFinite(t)) return fluxIn;

  const state = args.state;

  // Optional reset on backward time jumps (reset/seek semantics).
  const r = args.resetOnTimeJump;
  const resetEnabled = typeof r === "boolean" ? r : Boolean(r?.enabled);
  if (resetEnabled && typeof state.lastT === "number" && Number.isFinite(state.lastT)) {
    const rawDt = t - state.lastT;
    if (Number.isFinite(rawDt) && rawDt < 0) {
      resetInstrumentNoiseState(state, {
        resetRng: typeof r === "object" ? Boolean(r.resetRng) : false,
      });
    }
  }

  const correlatedEnabled = Boolean(cfg.correlatedNoise?.enabled);
  const tempEnabled = Boolean(cfg.trends?.enabled && cfg.trends.temperature?.enabled);
  const dt = computeDt(t, args.dtSec, state.lastT);
  state.lastT = t;

  // If correlated noise was enabled and is now disabled, reset its memory so re-enable starts fresh.
  if (state._wasCorrelatedEnabled && !correlatedEnabled) {
    state.ar1 = state.ar1 ?? { x: 0 };
    state.ar1.x = 0;
    state.ar1Bank = undefined;
    state.oneOverFSignature = undefined;
  }
  state._wasCorrelatedEnabled = correlatedEnabled;

  // Temperature random walk: optional reset-on-disable behavior.
  const tempResetOnDisable = Boolean(cfg.trends?.temperature?.resetOnDisable);
  if (tempResetOnDisable && state._wasTempEnabled && !tempEnabled) {
    state.tempRW = 0;
  }
  state._wasTempEnabled = tempEnabled;

  // ---------- Deterministic systematics + correlated noise (flux units, additive) ----------
  const sysFluxAdd = applyDeterministicSystematics(state, cfg.trends, t, dt);
  const corrFluxAdd = correlatedEnabled ? applyCorrelatedNoise(state, cfg.correlatedNoise, dt) : 0;

  // Combine physical flux with additive terms, then apply detector/atmosphere effects.
  const fluxPreNoise = applyFluxDomainEffects(state, cfg, fluxIn + sysFluxAdd + corrFluxAdd, t, dt);

  // ---------- Photon + read noise in electrons ----------
  let fluxOut = applyElectronNoise(state, cfg, fluxPreNoise);

  if (isGapSample(cfg.observer, t)) return Number.NaN;

  fluxOut = applyDetrend(fluxOut, t, cfg.postprocess, state);

  // Optional clamp for numerical safety / UI preferences.
  const clampCfg = cfg.clampFlux;
  if (clampCfg?.enabled) {
    const lo = toFiniteNumber(clampCfg.min, -1e9);
    const hi = toFiniteNumber(clampCfg.max, 1e9);
    fluxOut = clamp(fluxOut, lo, hi);
  }

  // Guard: if NaN/Inf produced by extreme inputs, fall back to pre-noise.
  if (!Number.isFinite(fluxOut)) return Number.isFinite(fluxPreNoise) ? fluxPreNoise : 1.0;

  return fluxOut;
}

export { runInstrumentNoiseSelfTests } from "./instrumentNoiseSelfTest";
