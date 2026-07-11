import { clamp, toFiniteNumber } from "../core/units";
import type { InstrumentNoiseState, InstrumentNoiseSystematicsParams } from "./instrumentNoise";
import {
  applyCorrelatedNoise,
  applyDeterministicSystematics,
  applyFluxDomainEffects,
} from "./instrumentNoiseHelpers";

export type ResetInstrumentNoiseState = (
  state: InstrumentNoiseState,
  opts?: { resetRng?: boolean; seed?: number },
) => void;

export function maybeResetOnTimeJump(args: {
  tSec: number;
  resetOnTimeJump?: boolean | { enabled?: boolean; resetRng?: boolean };
  state: InstrumentNoiseState;
  resetState: ResetInstrumentNoiseState;
}): void {
  const r = args.resetOnTimeJump;
  const resetEnabled = typeof r === "boolean" ? r : Boolean(r?.enabled);
  if (!resetEnabled || typeof args.state.lastT !== "number" || !Number.isFinite(args.state.lastT)) return;

  const rawDt = args.tSec - args.state.lastT;
  if (!(Number.isFinite(rawDt) && rawDt < 0)) return;
  args.resetState(args.state, {
    resetRng: typeof r === "object" ? Boolean(r.resetRng) : false,
  });
}

export function updateNoiseMemoryFlags(
  state: InstrumentNoiseState,
  cfg: InstrumentNoiseSystematicsParams,
  flags: { correlatedEnabled: boolean; tempEnabled: boolean },
): void {
  resetCorrelatedMemoryIfDisabled(state, flags.correlatedEnabled);
  state._wasCorrelatedEnabled = flags.correlatedEnabled;
  resetTemperatureMemoryIfDisabled(state, cfg, flags.tempEnabled);
  state._wasTempEnabled = flags.tempEnabled;
}

function resetCorrelatedMemoryIfDisabled(state: InstrumentNoiseState, correlatedEnabled: boolean): void {
  if (!(state._wasCorrelatedEnabled && !correlatedEnabled)) return;
  state.ar1 = state.ar1 ?? { x: 0 };
  state.ar1.x = 0;
  state.ar1Bank = undefined;
  state.oneOverFSignature = undefined;
}

function resetTemperatureMemoryIfDisabled(
  state: InstrumentNoiseState,
  cfg: InstrumentNoiseSystematicsParams,
  tempEnabled: boolean,
): void {
  const tempResetOnDisable = Boolean(cfg.trends?.temperature?.resetOnDisable);
  if (tempResetOnDisable && state._wasTempEnabled && !tempEnabled) state.tempRW = 0;
}

export function clampMeasuredFlux(fluxOut: number, cfg: InstrumentNoiseSystematicsParams): number {
  const clampCfg = cfg.clampFlux;
  if (!clampCfg?.enabled) return fluxOut;
  const lo = toFiniteNumber(clampCfg.min, -1e9);
  const hi = toFiniteNumber(clampCfg.max, 1e9);
  return clamp(fluxOut, lo, hi);
}

export function finiteNoiseOutputOrFallback(fluxOut: number, fluxPreNoise: number): number {
  if (Number.isFinite(fluxOut)) return fluxOut;
  return Number.isFinite(fluxPreNoise) ? fluxPreNoise : 1.0;
}

export function measuredFluxBeforeElectronNoise(params: {
  fluxIn: number;
  t: number;
  dt: number;
  cfg: InstrumentNoiseSystematicsParams;
  state: InstrumentNoiseState;
  correlatedEnabled: boolean;
}): number {
  const sysFluxAdd = applyDeterministicSystematics(params.state, params.cfg.trends, params.t, params.dt);
  const corrFluxAdd = params.correlatedEnabled
    ? applyCorrelatedNoise(params.state, params.cfg.correlatedNoise, params.dt)
    : 0;
  return applyFluxDomainEffects(
    params.state,
    params.cfg,
    params.fluxIn + sysFluxAdd + corrFluxAdd,
    params.t,
    params.dt,
  );
}
