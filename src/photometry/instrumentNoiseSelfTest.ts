import type { InstrumentNoiseSystematicsParams } from "../core/instrumentNoiseTypes";
import {
  applyInstrumentNoiseAndSystematics,
  createInstrumentNoiseState,
  type InstrumentNoiseState,
} from "./instrumentNoise";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`instrumentNoise self-test failed: ${msg}`);
}

function runSequence(cfg: InstrumentNoiseSystematicsParams, state: InstrumentNoiseState): number {
  let t = 0;
  let flux = 1.0;
  for (let i = 0; i < 20; i++) {
    t += 1;
    flux = applyInstrumentNoiseAndSystematics({
      flux,
      tSec: t,
      dtSec: 1,
      cfg,
      state,
    });
  }
  return flux;
}

export function runInstrumentNoiseSelfTests(): void {
  const cfg: InstrumentNoiseSystematicsParams = {
    enabled: true,
    seed: 123,
    electronsPerUnitFlux: 1e6,
    exposureSec: 2,
    throughput: 1,
    photonNoise: { enabled: true, gaussianApproxMinElectrons: 50 },
    readNoise: { enabled: true, sigmaElectrons: 10 },
    correlatedNoise: { enabled: true, sigmaFlux: 1e-3, tauSec: 50 },
    trends: { enabled: false },
  };

  const f1 = runSequence(cfg, createInstrumentNoiseState(cfg.seed));
  const f2 = runSequence(cfg, createInstrumentNoiseState(cfg.seed));
  assert(Object.is(f1, f2), "Determinism: same seed and sequence must match.");
  assert(Number.isFinite(f1), "Output must be finite.");

  const cfgNoExp: InstrumentNoiseSystematicsParams = {
    enabled: true,
    seed: 1,
    electronsPerUnitFlux: 1e6,
    exposureSec: 0,
    throughput: 1,
    photonNoise: { enabled: true },
    readNoise: { enabled: true, sigmaElectrons: 10 },
    correlatedNoise: { enabled: false },
    trends: { enabled: false },
  };

  const out = applyInstrumentNoiseAndSystematics({
    flux: 1.234,
    tSec: 10,
    dtSec: 1,
    cfg: cfgNoExp,
    state: createInstrumentNoiseState(cfgNoExp.seed),
  });

  assert(Number.isFinite(out) && out === 1.234, "exposureSec=0 must not inject electron noise by default.");
}
