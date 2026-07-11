import { expect, it } from "vitest";

import type { InstrumentNoiseSystematicsParams } from "../../src/core/instrumentNoiseTypes";
import {
  applyInstrumentNoiseAndSystematics,
  createInstrumentNoiseState,
  resetInstrumentNoiseState,
} from "../../src/photometry/instrumentNoise";

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

it("returns NaN for configured data-gap windows without throwing", () => {
  const cfg: InstrumentNoiseSystematicsParams = {
    enabled: true,
    seed: 5,
    photonNoise: { enabled: false },
    readNoise: { enabled: false },
    correlatedNoise: { enabled: false },
    trends: { enabled: false },
    observer: {
      enabled: true,
      dataGaps: {
        enabled: true,
        windowsSec: [{ startSec: 10, endSec: 20 }],
      },
    },
  };

  const state = createInstrumentNoiseState(cfg.seed);
  const outside = applyInstrumentNoiseAndSystematics({
    flux: 0.99,
    tSec: 5,
    dtSec: 1,
    cfg,
    state,
  });
  const inside = applyInstrumentNoiseAndSystematics({
    flux: 0.99,
    tSec: 15,
    dtSec: 10,
    cfg,
    state,
  });

  expect(outside).toBe(0.99);
  expect(Number.isNaN(inside)).toBe(true);
});

it("applies bounded observer-atmosphere attenuation and sky-background residuals", () => {
  const cfg: InstrumentNoiseSystematicsParams = {
    enabled: true,
    seed: 9,
    electronsPerUnitFlux: 1e4,
    exposureSec: 10,
    throughput: 1,
    photonNoise: { enabled: false },
    readNoise: { enabled: false },
    correlatedNoise: { enabled: false },
    trends: { enabled: false },
    observer: {
      enabled: true,
      atmosphere: {
        enabled: true,
        airmass: {
          enabled: true,
          base: 1.8,
          extinctionCoeff: 0.1,
        },
        clouds: {
          enabled: true,
          meanOpticalDepth: 0.2,
          sigmaOpticalDepth: 0,
        },
        seeing: {
          enabled: true,
          meanLoss: 0.03,
          sigmaLoss: 0,
          airmassExponent: 0.5,
          maxLoss: 0.2,
        },
        tellurics: {
          enabled: true,
          meanOpticalDepth: 0.12,
          sigmaOpticalDepth: 0,
          airmassCoupling: 0.4,
        },
        skyBackground: {
          enabled: true,
          electronsPerSec: 500,
          subtractionResidualFraction: 0.05,
        },
      },
    },
  };

  const state = createInstrumentNoiseState(cfg.seed);
  const out = applyInstrumentNoiseAndSystematics({
    flux: 1,
    tSec: 0,
    dtSec: 1,
    cfg,
    state,
  });

  expect(out).toBeLessThan(1);
  expect(out).toBeGreaterThan(0.3);
});

it("can detrend a linear baseline drift back toward unity after warmup", () => {
  const rawCfg: InstrumentNoiseSystematicsParams = {
    enabled: true,
    seed: 17,
    photonNoise: { enabled: false },
    readNoise: { enabled: false },
    correlatedNoise: { enabled: false },
    trends: {
      enabled: true,
      temperature: {
        enabled: true,
        linearSlopeFluxPerSec: 2e-4,
        randomWalkSigmaFluxPerSqrtSec: 0,
      },
    },
  };
  const detrendedCfg: InstrumentNoiseSystematicsParams = {
    ...rawCfg,
    postprocess: {
      enabled: true,
      detrend: {
        enabled: true,
        mode: "linear",
        windowSec: 30,
        minSamples: 4,
        preserveBaseline: true,
      },
    },
  };

  const rawState = createInstrumentNoiseState(rawCfg.seed);
  const detrendedState = createInstrumentNoiseState(detrendedCfg.seed);
  let raw = 1;
  let detrended = 1;

  for (let t = 0; t <= 8; t++) {
    raw = applyInstrumentNoiseAndSystematics({
      flux: 1,
      tSec: t,
      dtSec: 1,
      cfg: rawCfg,
      state: rawState,
    });
    detrended = applyInstrumentNoiseAndSystematics({
      flux: 1,
      tSec: t,
      dtSec: 1,
      cfg: detrendedCfg,
      state: detrendedState,
    });
  }

  expect(Math.abs(raw - 1)).toBeGreaterThan(1e-3);
  expect(Math.abs(detrended - 1)).toBeLessThan(Math.abs(raw - 1));
  expect(Math.abs(detrended - 1)).toBeLessThan(2e-4);
});
