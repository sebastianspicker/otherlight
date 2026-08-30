/** Applies stateful instrument noise and systematics to normalized flux samples. */

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

import { createMulberry32 } from "./random";
import { applyDetrend, applyElectronNoise, computeDt, isGapSample } from "./instrumentNoiseHelpers";
import {
  clampMeasuredFlux,
  finiteNoiseOutputOrFallback,
  maybeResetOnTimeJump,
  measuredFluxBeforeElectronNoise,
  updateNoiseMemoryFlags,
} from "./instrumentNoiseRuntime";

// Keep public type re-exports for backwards compatibility with existing imports.
import type { InstrumentNoiseState, InstrumentNoiseSystematicsParams } from "./instrumentNoiseTypes";
export type { InstrumentNoiseState, InstrumentNoiseSystematicsParams } from "./instrumentNoiseTypes";

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
 * Applies instrument noise and systematics to a flux sample in normalized stellar units.
 * Mutates `state` to preserve correlated-noise continuity; disabled configuration is a strict, mutation-free no-op.
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
  maybeResetOnTimeJump({
    tSec: t,
    resetOnTimeJump: args.resetOnTimeJump,
    state,
    resetState: resetInstrumentNoiseState,
  });

  const correlatedEnabled = Boolean(cfg.correlatedNoise?.enabled);
  const tempEnabled = Boolean(cfg.trends?.enabled && cfg.trends.temperature?.enabled);
  const dt = computeDt(t, args.dtSec, state.lastT);
  state.lastT = t;
  updateNoiseMemoryFlags(state, cfg, { correlatedEnabled, tempEnabled });

  const fluxPreNoise = measuredFluxBeforeElectronNoise({ fluxIn, t, dt, cfg, state, correlatedEnabled });
  let fluxOut = applyElectronNoise(state, cfg, fluxPreNoise);

  if (isGapSample(cfg.observer, t)) return Number.NaN;

  fluxOut = applyDetrend(fluxOut, t, cfg.postprocess, state);
  return finiteNoiseOutputOrFallback(clampMeasuredFlux(fluxOut, cfg), fluxPreNoise);
}
