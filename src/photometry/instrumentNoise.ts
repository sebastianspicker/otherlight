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

import { clamp, toFiniteNonNeg, toFiniteNumber } from "../core/units";
import {
  createMulberry32,
  normal as normalSample,
  ouStep,
  poisson as poissonSample,
  randomWalkStep,
  type PRNG as PRNGPublic,
} from "./random";

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
}

type OneOverFCfg = NonNullable<NonNullable<InstrumentNoiseSystematicsParams["correlatedNoise"]>["oneOverF"]>;

function makeOneOverFSignature(cfg: OneOverFCfg): string {
  const n = Math.max(1, Math.floor(toFiniteNumber(cfg.nComponents, 6)));
  const tauMin = toFiniteNumber(cfg.tauMinSec, 10);
  const tauMax = toFiniteNumber(cfg.tauMaxSec, 10_000);
  const sigma = toFiniteNumber(cfg.sigmaFlux, 0);
  return `${n}|${tauMin}|${tauMax}|${sigma}`;
}

function ensureOneOverFBank(state: InstrumentNoiseState, oneF: OneOverFCfg): void {
  const sig = makeOneOverFSignature(oneF);
  if (state.ar1Bank && state.oneOverFSignature === sig) return;

  const n = Math.max(1, Math.floor(toFiniteNumber(oneF.nComponents, 6)));
  const tauMin = Math.max(1e-6, toFiniteNumber(oneF.tauMinSec, 10));
  const tauMax = Math.max(tauMin, toFiniteNumber(oneF.tauMaxSec, 10_000));
  const sigmaTotal = Math.max(0, toFiniteNumber(oneF.sigmaFlux, 0));

  // Choose weights so that total RMS ≈ sigmaTotal for independent unit-RMS components.
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

function computeDt(tSec: number, dtSec: unknown, lastT: number | undefined): number {
  if (typeof dtSec === "number" && Number.isFinite(dtSec) && dtSec > 0) return dtSec;
  if (typeof lastT === "number" && Number.isFinite(lastT)) return Math.max(0, tSec - lastT);
  return 0;
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

  // ---------- Deterministic trends/systematics (flux units, additive) ----------
  let sysFluxAdd = 0;
  const trends = cfg.trends;
  if (trends?.enabled) {
    // 1. Roll / Periodic Systematics (e.g. HST breathe)
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

    // 2. Temperature Effects (Drift + Random Walk)
    const temp = trends.temperature;
    if (temp?.enabled) {
      const slope = toFiniteNumber(temp.linearSlopeFluxPerSec, 0);
      if (Number.isFinite(slope) && slope !== 0) sysFluxAdd += slope * t;

      // Random Walk part of temp (flux-domain OU random walk)
      const rwSigma = Math.max(0, toFiniteNumber(temp.randomWalkSigmaFluxPerSqrtSec, 0));
      // Re-use core randomWalkStep if available, or manual:
      // We stored randomWalkStep in imports.
      if (rwSigma > 0 && dt > 0) {
        // If imports are correct:
        const next = randomWalkStep(state.rng, state.tempRW ?? 0, dt, rwSigma);
        state.tempRW = Number.isFinite(next) ? next : (state.tempRW ?? 0);
      } else if (rwSigma > 0 && dt === 0 && state.tempRW === undefined) {
        state.tempRW = 0;
      }
      sysFluxAdd += state.tempRW ?? 0;
    }

    // 3. Intra-Pixel Sensitivity (Toy Model)
    const ip = trends.intraPixel;
    if (ip?.enabled) {
      const amp = toFiniteNumber(ip.ampFlux, 0);
      const ax = toFiniteNumber(ip.ax, 0);
      const ay = toFiniteNumber(ip.ay, 0);
      const Px = toFiniteNumber(ip.periodXSec, NaN);
      const Py = toFiniteNumber(ip.periodYSec, NaN);
      const phaseY = toFiniteNumber(ip.phaseY, 0);

      if (
        Number.isFinite(amp) &&
        amp !== 0 &&
        Number.isFinite(Px) &&
        Px > 0 &&
        Number.isFinite(Py) &&
        Py > 0
      ) {
        // Simulate "position" wandering over the pixel grid
        const x = ax * Math.sin((2 * Math.PI * t) / Px);
        const y = ay * Math.sin((2 * Math.PI * t) / Py + phaseY);
        // Toy periodic intra-pixel response (dimensionless response in [-0.5, 0.5]).
        // Using a separable 2D pattern keeps a bounded, smooth modulation.
        const resp = 0.5 * Math.cos(2 * Math.PI * x) * Math.cos(2 * Math.PI * y);
        sysFluxAdd += amp * resp;
      }
    }
  }

  // ---------- Correlated noise (flux units, additive) ----------
  let corrFluxAdd = 0;
  if (correlatedEnabled) {
    // AR1 / OU Process
    const corrCfg = cfg.correlatedNoise;
    const sigma = Math.max(0, toFiniteNumber(corrCfg?.sigmaFlux, 0));
    const tau = Math.max(1e-6, toFiniteNumber(corrCfg?.tauSec, 100));

    state.ar1 = state.ar1 ?? { x: 0 };
    if (sigma > 0 && dt > 0) {
      // ouStep(rng, current, dt, tau, sigma)
      const xNew = ouStep(state.rng, state.ar1.x, dt, tau, sigma);
      state.ar1.x = Number.isFinite(xNew) ? xNew : state.ar1.x;
    }
    if (sigma > 0) corrFluxAdd += state.ar1.x;

    // 1/f Noise Bank
    const oneF = corrCfg?.oneOverF;
    if (oneF?.enabled) {
      ensureOneOverFBank(state, oneF);
      if (state.ar1Bank && dt > 0) {
        for (const comp of state.ar1Bank) {
          // weight is pre-calculated in bank. ouStep needs unit sigma if weight handled outside?
          // ensureOneOverFBank puts weight in comp.weight.
          // We evolve process with unit variance? No, ouStep takes sigma.
          // Wait, ouStep signature: (rng, x, dt, tau, sigma).
          // If we want the component to have specific RMS, we pass that as sigma.
          // The bank stores 'weight' which IS the target sigma for that component.
          const cx = ouStep(state.rng, comp.x, dt, comp.tau, comp.weight);
          comp.x = Number.isFinite(cx) ? cx : comp.x;
          corrFluxAdd += comp.x;
        }
      } else if (state.ar1Bank) {
        // dt=0, just sum existing
        for (const comp of state.ar1Bank) {
          corrFluxAdd += comp.x;
        }
      }
    } else {
      // Disable bank (predictable toggle).
      state.ar1Bank = undefined;
      state.oneOverFSignature = undefined;
    }
  } else {
    // If correlated noise is off, ensure its additive term is strictly 0.
    corrFluxAdd = 0;
  }

  // Combine physical flux with additive systematics + correlated components before electron conversion.
  let fluxPreNoise = fluxIn + sysFluxAdd + corrFluxAdd;

  // Optional detector realism hooks in flux domain.
  const det = cfg.detector;
  if (det?.enabled) {
    const prnuSigma = Math.max(0, toFiniteNumber(det.prnuSigma, 0));
    if (prnuSigma > 0) {
      const gain = 1 + normalSample(state.rng, 0, prnuSigma);
      fluxPreNoise *= Math.max(0, gain);
    }

    const jitterSigmaPx = Math.max(0, toFiniteNumber(det.jitterSigmaPx, 0));
    if (jitterSigmaPx > 0) {
      const jx = normalSample(state.rng, 0, jitterSigmaPx);
      const jy = normalSample(state.rng, 0, jitterSigmaPx);
      const r2 = jx * jx + jy * jy;
      fluxPreNoise *= Math.max(0, 1 - 0.02 * r2);
    }
  }

  // ---------- Photon + read noise in electrons ----------
  const throughput = toFiniteNonNeg(cfg.throughput, 1);
  const ePerFluxPerSec = Math.max(0, toFiniteNumber(cfg.electronsPerUnitFlux, 1e6));
  const exposureSec = toFiniteNonNeg(cfg.exposureSec, 0);

  // If exposureSec <= 0, we cannot define an electron-count measurement for this sample.
  // In that case, we do not apply photon/read noise (only flux-domain terms above).
  const electronNoiseEnabled = exposureSec > 0 && ePerFluxPerSec > 0 && throughput > 0;

  let fluxOut = fluxPreNoise;

  if (electronNoiseEnabled) {
    // PROTECT against negative flux: Poisson undefined for lambda < 0.
    const meanElectronsRaw = Math.max(0, fluxPreNoise) * throughput * ePerFluxPerSec * exposureSec;
    const meanElectrons = Math.max(0, meanElectronsRaw);

    // Photon noise
    let electrons = meanElectrons;
    if (cfg.photonNoise?.enabled) {
      const gaussThresh = Math.max(0, toFiniteNumber(cfg.photonNoise.gaussianApproxMinElectrons, 50));

      // PERFORMANCE OPTIMIZATION:
      // Use Gaussian approximation for high counts to avoid O(lambda) cost of Knuth Poisson.
      if (meanElectrons >= gaussThresh) {
        // N(mean, sqrt(mean))
        electrons = normalSample(state.rng, meanElectrons, Math.sqrt(meanElectrons));
      } else {
        electrons = poissonSample(state.rng, meanElectrons);
      }
    }

    // Read noise (Gaussian, e- RMS)
    if (cfg.readNoise?.enabled) {
      const s = toFiniteNonNeg(cfg.readNoise.sigmaElectrons, 0);
      if (s > 0) electrons += normalSample(state.rng, 0, s);
    }

    if (det?.enabled) {
      const nonlin = Math.max(0, toFiniteNumber(det.nonlinearityCoeff, 0));
      if (nonlin > 0) {
        electrons = Math.max(0, electrons * (1 - nonlin * Math.max(0, electrons)));
      }

      const cti = Math.max(0, toFiniteNumber(det.ctiTrailCoeff, 0));
      if (cti > 0) {
        electrons = Math.max(0, electrons - cti * Math.sqrt(Math.max(0, electrons)));
      }

      const sat = toFiniteNumber(det.saturationElectrons, Number.NaN);
      if (Number.isFinite(sat) && sat > 0) {
        electrons = Math.min(electrons, sat);
      }
    }

    const denom = throughput * ePerFluxPerSec * exposureSec;
    fluxOut = denom > 0 ? electrons / denom : fluxPreNoise;
  }

  // Optional clamp for numerical safety / UI preferences.
  const clampCfg = cfg.clampFlux;
  if (clampCfg?.enabled) {
    const lo = toFiniteNumber(clampCfg.min, -1e9);
    const hi = toFiniteNumber(clampCfg.max, 1e9);
    fluxOut = clamp(fluxOut, lo, hi);
  }

  // Guard: if NaN/Inf produced by extreme inputs, fall back to pre-noise.
  if (!Number.isFinite(fluxOut)) return fluxPreNoise;

  return fluxOut;
}

// ---------------------------
// Minimal built-in tests
// ---------------------------

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`instrumentNoise self-test failed: ${msg}`);
}

/**
 * Self-tests:
 * - exposureSec=0 disables electron-noise layers (no NaN/div0).
 * - Determinism: same seed + same call sequence => identical output.
 */
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

  const s1 = createInstrumentNoiseState(cfg.seed);
  const s2 = createInstrumentNoiseState(cfg.seed);

  let t = 0;
  let f1 = 1.0;
  let f2 = 1.0;

  for (let i = 0; i < 20; i++) {
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
  }
  assert(Object.is(f1, f2), "Determinism: same seed and sequence must match.");
  assert(Number.isFinite(f1), "Output must be finite.");

  // exposureSec=0 => electron noise disabled => only flux-domain terms apply (here none).
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

  const s3 = createInstrumentNoiseState(cfgNoExp.seed);
  const out = applyInstrumentNoiseAndSystematics({
    flux: 1.234,
    tSec: 10,
    dtSec: 1,
    cfg: cfgNoExp,
    state: s3,
  });

  assert(Number.isFinite(out) && out === 1.234, "exposureSec=0 must not inject electron noise by default.");
}
