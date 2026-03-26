import { describe, expect, it } from "vitest";

import type { InstrumentNoiseSystematicsParams } from "../../src/core/instrumentNoiseTypes";
import {
  applyInstrumentNoiseAndSystematics,
  createInstrumentNoiseState,
  resetInstrumentNoiseState,
} from "../../src/photometry/instrumentNoise";

describe("instrument noise determinism", () => {
  it("produces identical sequences for the same seed and call order", () => {
    const cfg: InstrumentNoiseSystematicsParams = {
      enabled: true,
      seed: 123,
      electronsPerUnitFlux: 1e6,
      exposureSec: 1,
      throughput: 1,
      photonNoise: { enabled: true, gaussianApproxMinElectrons: 0 },
      readNoise: { enabled: false },
      correlatedNoise: { enabled: true, sigmaFlux: 1e-3, tauSec: 50 },
      trends: { enabled: false },
    };

    const s1 = createInstrumentNoiseState(cfg.seed);
    const s2 = createInstrumentNoiseState(cfg.seed);

    let t = 0;
    let f1 = 1.0;
    let f2 = 1.0;

    for (let i = 0; i < 10; i++) {
      t += 1;
      f1 = applyInstrumentNoiseAndSystematics({
        flux: f1,
        tSec: t,
        dtSec: 1,
        cfg,
        state: s1,
      });
      f2 = applyInstrumentNoiseAndSystematics({
        flux: f2,
        tSec: t,
        dtSec: 1,
        cfg,
        state: s2,
      });
      expect(f1).toBe(f2);
    }
  });

  it("reset with RNG reseed reproduces the same first sample", () => {
    const cfg: InstrumentNoiseSystematicsParams = {
      enabled: true,
      seed: 7,
      electronsPerUnitFlux: 1e6,
      exposureSec: 1,
      throughput: 1,
      photonNoise: { enabled: true, gaussianApproxMinElectrons: 0 },
      readNoise: { enabled: true, sigmaElectrons: 5 },
      correlatedNoise: { enabled: true, sigmaFlux: 1e-3, tauSec: 50 },
      trends: { enabled: false },
    };

    const state = createInstrumentNoiseState(cfg.seed);
    const first = applyInstrumentNoiseAndSystematics({
      flux: 1.0,
      tSec: 1,
      dtSec: 1,
      cfg,
      state,
    });

    resetInstrumentNoiseState(state, { resetRng: true, seed: cfg.seed });

    const again = applyInstrumentNoiseAndSystematics({
      flux: 1.0,
      tSec: 1,
      dtSec: 1,
      cfg,
      state,
    });

    expect(again).toBe(first);
  });

  it("does not mutate state when noise is disabled", () => {
    const cfg: InstrumentNoiseSystematicsParams = {
      enabled: false,
      seed: 11,
    };

    const state = createInstrumentNoiseState(cfg.seed);
    state.lastT = 123;

    const out = applyInstrumentNoiseAndSystematics({
      flux: 0.75,
      tSec: 200,
      dtSec: 1,
      cfg,
      state,
    });

    expect(out).toBe(0.75);
    expect(state.lastT).toBe(123);
  });

  it("applies deterministic drift-family trends", () => {
    const cfg: InstrumentNoiseSystematicsParams = {
      enabled: true,
      seed: 1,
      trends: {
        enabled: true,
        driftFamilies: {
          enabled: true,
          amplitudesFlux: [1e-3, 5e-4],
          periodsSec: [100, 250],
          phasesRad: [0, Math.PI / 3],
        },
      },
      photonNoise: { enabled: false },
      readNoise: { enabled: false },
      correlatedNoise: { enabled: false },
    };

    const state = createInstrumentNoiseState(cfg.seed);
    const a = applyInstrumentNoiseAndSystematics({
      flux: 1,
      tSec: 50,
      dtSec: 1,
      cfg,
      state,
    });
    resetInstrumentNoiseState(state, { resetRng: true, seed: cfg.seed });
    const b = applyInstrumentNoiseAndSystematics({
      flux: 1,
      tSec: 50,
      dtSec: 1,
      cfg,
      state,
    });

    expect(a).toBe(b);
    expect(a).not.toBe(1);
  });
});
