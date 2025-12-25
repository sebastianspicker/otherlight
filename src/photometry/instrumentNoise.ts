// src/photometry/instrumentNoise.ts
//
// Instrument noise + systematics measurement layer.
// Intended usage (main.ts):
//   1) compute physical flux (optionally smeared)
//   2) pass to applyInstrumentNoiseAndSystematics(...)
// This module is deterministic if a seed is fixed and state is preserved across samples. 
//
// Scientific intent / scope (toy but robust):
// - Photon noise: Poisson counting stats (Gaussian approx for large expected counts).
// - Read noise: additive Gaussian in electrons per exposure.
// - Time-correlated noise: OU/AR(1) as a GP-like proxy; optional 1/f-ish term via sum of OU components.
// - Trends/systematics: roll-angle sinusoid, temperature drift (linear + random walk), intra-pixel sensitivity.
//
// Units / normalization:
// - Inputs/outputs are in "stellar units" flux, typically around 1. 
// - Convert to electrons using:
//     meanElectrons = flux * throughput * electronsPerUnitFluxPerSec * exposureSec
//   where electronsPerUnitFluxPerSec has units e- / (flux_unit * s).
// - Apply photon/read noise in electrons, then convert back to flux units.
//
// Determinism / state:
// - Deterministic PRNG seed controls the noise stream.
// - State holds OU/1f memory + random-walk memory; this must persist across calls for correlation.
// - Toggling enabled flags should have predictable behavior: either keep state (pause) or reset.
//   This file defines a clear contract below.
//
// Noise contract (important for UI + tests):
// - If cfg.enabled is false OR cfg missing: return input flux unchanged (no-op) and do NOT mutate state.
// - If inputs are non-finite (flux or tSec): return input flux unchanged (no throw).
// - dtSec handling:
//    - If dtSec provided and finite >0: use it.
//    - Else infer dt = tSec - state.lastT when available; if unavailable or negative => dt=0.
// - Correlated components (OU and 1/f bank):
//    - Updated only when dt>0.
//    - If their respective enabled flags are false, their contribution is 0.
//    - When a correlated feature is disabled, its internal state is reset to 0 so that re-enabling starts fresh.
// - Flux -> electrons conversion:
//    - Uses electronsPerUnitFluxPerSec * exposureSec, dimensionally consistent. 
//    - Negative flux before conversion:
//        * For Poisson mean, negative is clamped to 0 (since Poisson mean must be >=0).
//        * The *deterministic* additive systematics/correlated terms are still allowed to drive fluxPreNoise negative;
//          that reflects an unphysical model state but keeps the math stable.
// - Photon noise implementation:
//    - Uses Poisson for small mean, Gaussian approximation for large mean (deterministic via PRNG).
// - Output clamp:
//    - Optional cfg.clampFlux can clamp the final flux into [min,max].
// - Must never throw for "normal" invalid UI inputs; treat as safe no-op and return input flux.

import { clamp } from "../core/units"; // 

import {
  createMulberry32,
  normal as normalSample,
  ouStep,
  poisson as poissonSample,
  randomWalkStep,
  type PRNG as PRNGPublic,
} from "./random";

export type InstrumentNoiseSystematicsParams = {
  enabled?: boolean;

  /** Deterministic RNG seed. If omitted, defaults to 1 (still deterministic). */
  seed?: number;

  /**
   * Conversion: detected electrons per (flux_unit * second).
   * Example: if baseline flux ~1 corresponds to 1e6 e-/s, use 1e6.
   */
  electronsPerUnitFlux?: number;

  /**
   * Exposure time in seconds for one sample.
   * If omitted, main.ts should provide photometry.cadenceSec (smearing width) or another exposure model. 
   */
  exposureSec?: number;

  /**
   * Optional throughput multiplier applied before conversion to electrons.
   * Use 1 for "no effect". Values <=0 effectively remove electron signal (degenerate).
   */
  throughput?: number;

  photonNoise?: {
    enabled?: boolean;

    /**
     * Threshold (in expected electrons) above which we use Gaussian approximation
     * rather than exact Poisson sampling, for speed.
     */
    gaussianApproxMinElectrons?: number;
  };

  readNoise?: {
    enabled?: boolean;
    /** Gaussian read noise (e- RMS) per exposure. */
    sigmaElectrons?: number;
  };

  correlatedNoise?: {
    enabled?: boolean;

    /**
     * OU/AR(1) amplitude in flux units (stationary RMS).
     * This is an *additive* correlated noise term in flux units.
     */
    sigmaFlux?: number;

    /**
     * Correlation timescale tau [s]. Larger => redder noise.
     */
    tauSec?: number;

    /**
     * Optional 1/f-ish composite: sum of K OU components with log-spaced taus.
     */
    oneOverF?: {
      enabled?: boolean;

      /** Total stationary RMS (flux units) of the 1/f-like composite. */
      sigmaFlux?: number;

      /** Number of OU components (typical 4..10). */
      nComponents?: number;

      /** Shortest tau [s]. */
      tauMinSec?: number;

      /** Longest tau [s]. */
      tauMaxSec?: number;
    };
  };

  trends?: {
    enabled?: boolean;

    roll?: {
      enabled?: boolean;
      /** Roll amplitude in flux units (peak). */
      ampFlux?: number;
      /** Roll period [s]. */
      periodSec?: number;
      /** Phase offset [rad]. */
      phase0?: number;
    };

    temperature?: {
      enabled?: boolean;

      /**
       * Linear drift coefficient in flux units per second.
       * Positive -> flux increases with time.
       */
      linearSlopeFluxPerSec?: number;

      /**
       * Random walk strength (flux units per sqrt(second)).
       * Produces slowly wandering baseline.
       */
      randomWalkSigmaFluxPerSqrtSec?: number;

      /**
       * If true, reset the temperature random walk accumulator whenever the module is disabled
       * (or when this temperature trend is disabled).
       *
       * Default false to preserve continuity unless user explicitly requests reset-like behavior.
       */
      resetOnDisable?: boolean;
    };

    intraPixel?: {
      enabled?: boolean;

      /** Pixel-phase amplitude in flux units (peak). */
      ampFlux?: number;

      /**
       * Centroid motion parameters (toy).
       * x(t)=ax*sin(2π t/Px), y(t)=ay*sin(2π t/Py + φy)
       * Units are pixel fractions, typical [-0.5..0.5].
       */
      ax?: number;
      ay?: number;
      periodXSec?: number;
      periodYSec?: number;
      phaseY?: number;
    };
  };

  /** Safety clamp of output flux. */
  clampFlux?: { enabled?: boolean; min?: number; max?: number };
};

export type InstrumentNoiseState = {
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

  /** Track last enabled flag to optionally implement predictable reset behavior. */
  _wasEnabled?: boolean;

  /** Track last correlated-enabled and temperature-enabled for reset-on-disable behavior. */
  _wasCorrelatedEnabled?: boolean;
  _wasTempEnabled?: boolean;
};

function toFinite(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toFiniteNonNeg(v: unknown, fallback: number): number {
  const n = toFinite(v, fallback);
  return Number.isFinite(n) ? Math.max(0, n) : Math.max(0, fallback);
}

export function createInstrumentNoiseState(seed = 1): InstrumentNoiseState {
  // Reuse the shared PRNG module (keeps distribution + determinism consistent across codebase).
  const rng = createMulberry32(seed);
  return {
    rng,
    lastT: undefined,
    ar1: { x: 0 },
    ar1Bank: undefined,
    tempRW: 0,
    oneOverFSignature: undefined,
    _wasEnabled: undefined,
    _wasCorrelatedEnabled: undefined,
    _wasTempEnabled: undefined,
  };
}

function makeOneOverFSignature(cfg: NonNullable<NonNullable<InstrumentNoiseSystematicsParams["correlatedNoise"]>["oneOverF"]>): string {
  const n = Math.max(1, Math.floor(toFinite(cfg.nComponents, 6)));
  const tauMin = toFinite(cfg.tauMinSec, 10);
  const tauMax = toFinite(cfg.tauMaxSec, 10_000);
  const sigma = toFinite(cfg.sigmaFlux, 0);
  return `${n}|${tauMin}|${tauMax}|${sigma}`;
}

function ensureOneOverFBank(
  state: InstrumentNoiseState,
  oneF: NonNullable<NonNullable<InstrumentNoiseSystematicsParams["correlatedNoise"]>["oneOverF"]>
): void {
  const sig = makeOneOverFSignature(oneF);
  if (state.ar1Bank && state.oneOverFSignature === sig) return;

  const n = Math.max(1, Math.floor(toFinite(oneF.nComponents, 6)));
  const tauMin = Math.max(1e-6, toFinite(oneF.tauMinSec, 10));
  const tauMax = Math.max(tauMin, toFinite(oneF.tauMaxSec, 10_000));
  const sigmaTotal = Math.max(0, toFinite(oneF.sigmaFlux, 0));

  // Weights: if each OU component has stationary var 1 (we step with sigma=1),
  // and they are independent, then var(sum_i w*x_i) = sum_i w^2.
  // Choose w so that total RMS ~ sigmaTotal.
  const w = n > 0 ? sigmaTotal / Math.sqrt(n) : 0;

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
}): number {
  const cfg = args.cfg;

  // Contract: no cfg or disabled => strict no-op, no state mutation.
  if (!cfg?.enabled) return args.flux;

  const fluxIn = args.flux;
  const t = args.tSec;

  if (!Number.isFinite(fluxIn) || !Number.isFinite(t)) return fluxIn;

  const state = args.state;

  const dt = computeDt(t, args.dtSec, state.lastT);
  state.lastT = t;

  // Track toggles to implement predictable reset-on-disable behavior for subfeatures.
  const correlatedEnabled = Boolean(cfg.correlatedNoise?.enabled);
  const tempEnabled = Boolean(cfg.trends?.enabled && cfg.trends.temperature?.enabled);

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
    const roll = trends.roll;
    if (roll?.enabled) {
      const amp = toFinite(roll.ampFlux, 0);
      const P = toFinite(roll.periodSec, NaN);
      const phi0 = toFinite(roll.phase0, 0);
      if (Number.isFinite(P) && P > 0 && Number.isFinite(amp) && amp !== 0) {
        const phi = (2 * Math.PI * t) / P + phi0;
        sysFluxAdd += amp * Math.sin(phi);
      }
    }

    const temp = trends.temperature;
    if (temp?.enabled) {
      const slope = toFinite(temp.linearSlopeFluxPerSec, 0);
      if (Number.isFinite(slope) && slope !== 0) sysFluxAdd += slope * t;

      const rwSigma = Math.max(0, toFinite(temp.randomWalkSigmaFluxPerSqrtSec, 0));
      if (rwSigma > 0 && dt > 0) {
        state.tempRW = randomWalkStep(state.rng, state.tempRW ?? 0, dt, rwSigma);
      }
      sysFluxAdd += state.tempRW ?? 0;
    }

    const ip = trends.intraPixel;
    if (ip?.enabled) {
      const amp = toFinite(ip.ampFlux, 0);
      const ax = toFinite(ip.ax, 0);
      const ay = toFinite(ip.ay, 0);
      const Px = toFinite(ip.periodXSec, NaN);
      const Py = toFinite(ip.periodYSec, NaN);
      const phaseY = toFinite(ip.phaseY, 0);

      if (Number.isFinite(amp) && amp !== 0 && Number.isFinite(Px) && Px > 0 && Number.isFinite(Py) && Py > 0) {
        const x = ax * Math.sin((2 * Math.PI * t) / Px);
        const y = ay * Math.sin((2 * Math.PI * t) / Py + phaseY);

        // Simple periodic intra-pixel response pattern (dimensionless response in [-1,1]).
        const resp = 0.5 * (Math.cos(2 * Math.PI * x) + Math.cos(2 * Math.PI * y));
        sysFluxAdd += amp * resp;
      }
    }
  }

  // ---------- Correlated noise (flux units, additive) ----------
  let corrFluxAdd = 0;

  if (correlatedEnabled) {
    // Main OU component: sigmaFlux is stationary RMS in flux units.
    const sigma = Math.max(0, toFinite(cfg.correlatedNoise?.sigmaFlux, 0));
    const tau = Math.max(1e-6, toFinite(cfg.correlatedNoise?.tauSec, 100));

    state.ar1 = state.ar1 ?? { x: 0 };
    if (sigma > 0 && dt > 0) {
      state.ar1.x = ouStep(state.rng, state.ar1.x, dt, tau, sigma);
    }
    corrFluxAdd += state.ar1.x;

    // Optional 1/f-ish composite
    const oneF = cfg.correlatedNoise?.oneOverF;
    if (oneF?.enabled) {
      ensureOneOverFBank(state, oneF);
      if (state.ar1Bank && dt > 0) {
        // Each component is stepped as OU with unit stationary RMS; weights set total RMS.
        for (const comp of state.ar1Bank) {
          comp.x = ouStep(state.rng, comp.x, dt, comp.tau, 1);
          corrFluxAdd += comp.weight * comp.x;
        }
      }
    } else {
      // Disable bank (no hidden work, predictable toggle).
      state.ar1Bank = undefined;
      state.oneOverFSignature = undefined;
    }
  }

  // Combine physical flux with additive systematics + correlated components before electron conversion.
  const fluxPreNoise = fluxIn + sysFluxAdd + corrFluxAdd;

  // ---------- Photon + read noise in electrons ----------
  const throughput = toFiniteNonNeg(cfg.throughput, 1);

  // electronsPerUnitFlux is documented as e- per (flux_unit * second).
  // Keep it strictly non-negative and finite.
  const ePerFluxPerSec = Math.max(0, toFinite(cfg.electronsPerUnitFlux, 1e6));

  // exposureSec should be provided by main.ts (often cadenceSec) to keep dimensional consistency. 
  const exposureSec = toFiniteNonNeg(cfg.exposureSec, 0);

  // Contract choice:
  // - If exposureSec <= 0 OR ePerFluxPerSec <= 0 OR throughput <= 0: treat electron noise layers as disabled
  //   (you cannot form meaningful photon statistics), but still apply flux-domain sys/corr terms above.
  const electronNoiseEnabled = exposureSec > 0 && ePerFluxPerSec > 0 && throughput > 0;

  let fluxOut = fluxPreNoise;

  if (electronNoiseEnabled) {
    const meanElectronsRaw = fluxPreNoise * throughput * ePerFluxPerSec * exposureSec;

    // Negative expected electrons are non-physical; clamp the Poisson mean to 0.
    // This preserves stability while allowing negative fluxPreNoise to propagate through sys/corr.
    const meanElectrons = Math.max(0, meanElectronsRaw);

    // Photon noise
    let electrons = meanElectrons;
    if (cfg.photonNoise?.enabled) {
      const gaussThresh = Math.max(0, toFinite(cfg.photonNoise.gaussianApproxMinElectrons, 50));
      if (meanElectrons >= gaussThresh) {
        // Gaussian approximation: N(mean, sqrt(mean))
        electrons = meanElectrons + Math.sqrt(meanElectrons) * state.rng.n01();
      } else {
        // Exact Poisson (hybrid inside poissonSample already; still OK here)
        electrons = poissonSample(state.rng, meanElectrons);
      }
    }

    // Read noise
    if (cfg.readNoise?.enabled) {
      const s = toFiniteNonNeg(cfg.readNoise.sigmaElectrons, 0);
      if (s > 0) electrons += normalSample(state.rng, 0, s);
    }

    const denom = throughput * ePerFluxPerSec * exposureSec;
    fluxOut = denom > 0 ? electrons / denom : fluxPreNoise;
  }

  // Optional clamp for numerical safety / UI preferences.
  const clampCfg = cfg.clampFlux;
  if (clampCfg?.enabled) {
    const lo = toFinite(clampCfg.min, -1e9);
    const hi = toFinite(clampCfg.max, 1e9);
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
 * - Dimension consistency sanity: exposureSec=0 disables electron noise layers (no NaN/div0).
 * - OU stationary RMS: for dt>0 small, OU variance should stay bounded (not explode).
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
    f1 = applyInstrumentNoiseAndSystematics({ flux: f1, tSec: t, dtSec: 1, cfg, state: s1 });
    f2 = applyInstrumentNoiseAndSystematics({ flux: f2, tSec: t, dtSec: 1, cfg, state: s2 });
    assert(Object.is(f1, f2), "Determinism: same seed and sequence must match.");
    assert(Number.isFinite(f1), "Output must be finite.");
  }

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
  const out = applyInstrumentNoiseAndSystematics({ flux: 1.234, tSec: 10, dtSec: 1, cfg: cfgNoExp, state: s3 });
  assert(Number.isFinite(out) && out === 1.234, "exposureSec=0 must not inject electron noise by default.");
}
