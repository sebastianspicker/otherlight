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
  randomWalkStep,
  type PRNG as PRNGPublic,
} from "./random";
import {
  applyDetrend,
  computeDt,
  currentAirmass,
  ensureOneOverFBank,
  isGapSample,
  sampleElectrons,
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

    // 4. Drift families (deterministic correlated low-frequency components)
    const drift = trends.driftFamilies;
    if (drift?.enabled) {
      const amps = Array.isArray(drift.amplitudesFlux) ? drift.amplitudesFlux : [];
      const periods = Array.isArray(drift.periodsSec) ? drift.periodsSec : [];
      const phases = Array.isArray(drift.phasesRad) ? drift.phasesRad : [];
      const n = Math.min(amps.length, periods.length);
      for (let i = 0; i < n; i++) {
        const a = toFiniteNumber(amps[i], 0);
        const p = toFiniteNumber(periods[i], NaN);
        const ph = toFiniteNumber(phases[i], 0);
        if (!(Number.isFinite(a) && a !== 0 && Number.isFinite(p) && p > 0)) continue;
        sysFluxAdd += a * Math.sin((2 * Math.PI * t) / p + ph);
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

  // Combine physical flux with additive systematics + correlated components before observer-side contamination.
  let fluxPreNoise = fluxIn + sysFluxAdd + corrFluxAdd;

  // Optional detector realism hooks in flux domain.
  const det = cfg.detector;
  if (det?.enabled) {
    // Always draw PRNG samples to keep the stream deterministic regardless of
    // which detector features are enabled/disabled (avoids conditional consumption).
    const prnuDraw = normalSample(state.rng, 0, 1);
    const jitterDrawX = normalSample(state.rng, 0, 1);
    const jitterDrawY = normalSample(state.rng, 0, 1);

    const prnuSigma = Math.max(0, toFiniteNumber(det.prnuSigma, 0));
    if (prnuSigma > 0) {
      const gain = 1 + prnuDraw * prnuSigma;
      fluxPreNoise *= Math.max(0, gain);
    }

    const jitterSigmaPx = Math.max(0, toFiniteNumber(det.jitterSigmaPx, 0));
    if (jitterSigmaPx > 0) {
      const jx = jitterDrawX * jitterSigmaPx;
      const jy = jitterDrawY * jitterSigmaPx;
      const r2 = jx * jx + jy * jy;
      fluxPreNoise *= Math.max(0, 1 - 0.02 * r2);
    }
  }

  // ---------- Observer-side atmosphere contamination (bounded, didactic) ----------
  const observer = cfg.observer;
  const atmosphere = observer?.atmosphere;
  const airmass = currentAirmass(atmosphere, t);
  let observerTransmission = 1;

  if (observer?.enabled && atmosphere?.enabled) {
    const extinctionCoeff = Math.max(0, toFiniteNumber(atmosphere.airmass?.extinctionCoeff, 0));
    if (extinctionCoeff > 0) {
      observerTransmission *= Math.exp(-extinctionCoeff * airmass);
    }

    const clouds = atmosphere.clouds;
    if (clouds?.enabled) {
      const meanTau = Math.max(0, toFiniteNumber(clouds.meanOpticalDepth, 0));
      const sigmaTau = Math.max(0, toFiniteNumber(clouds.sigmaOpticalDepth, 0));
      const tauSec = Math.max(1e-6, toFiniteNumber(clouds.tauSec, 900));
      if (sigmaTau > 0 && dt > 0) {
        state.observerCloudTau = ouStep(state.rng, state.observerCloudTau ?? 0, dt, tauSec, sigmaTau);
      }
      const tau = Math.max(0, meanTau + (state.observerCloudTau ?? 0));
      observerTransmission *= Math.exp(-tau * airmass);
    }

    const tellurics = atmosphere.tellurics;
    if (tellurics?.enabled) {
      const meanTau = Math.max(0, toFiniteNumber(tellurics.meanOpticalDepth, 0));
      const sigmaTau = Math.max(0, toFiniteNumber(tellurics.sigmaOpticalDepth, 0));
      const tauSec = Math.max(1e-6, toFiniteNumber(tellurics.tauSec, 1200));
      if (sigmaTau > 0 && dt > 0) {
        state.observerTelluricTau = ouStep(state.rng, state.observerTelluricTau ?? 0, dt, tauSec, sigmaTau);
      }
      const airmassCoupling = Math.max(0, toFiniteNumber(tellurics.airmassCoupling, 0));
      const tau = Math.max(
        0,
        meanTau + (state.observerTelluricTau ?? 0) + airmassCoupling * Math.max(0, airmass - 1),
      );
      observerTransmission *= Math.exp(-tau);
    }

    const seeing = atmosphere.seeing;
    if (seeing?.enabled) {
      const meanLoss = Math.max(0, toFiniteNumber(seeing.meanLoss, 0));
      const sigmaLoss = Math.max(0, toFiniteNumber(seeing.sigmaLoss, 0));
      const tauSec = Math.max(1e-6, toFiniteNumber(seeing.tauSec, 600));
      if (sigmaLoss > 0 && dt > 0) {
        state.observerSeeingLoss = ouStep(state.rng, state.observerSeeingLoss ?? 0, dt, tauSec, sigmaLoss);
      }
      const airmassExponent = Math.max(0, toFiniteNumber(seeing.airmassExponent, 0));
      const maxLoss = clamp(toFiniteNumber(seeing.maxLoss, 0.9), 0, 0.99);
      const lossRaw = (meanLoss + (state.observerSeeingLoss ?? 0)) * Math.max(1, airmass ** airmassExponent);
      const loss = clamp(lossRaw, 0, maxLoss);
      observerTransmission *= Math.max(0, 1 - loss);
    }

    const scintillation = atmosphere.scintillation;
    if (scintillation?.enabled) {
      const sigmaFlux = Math.max(0, toFiniteNumber(scintillation.sigmaFlux, 0));
      const airmassExponent = Math.max(0, toFiniteNumber(scintillation.airmassExponent, 1.5));
      const exposureExponent = Math.max(0, toFiniteNumber(scintillation.exposureExponent, 0.5));
      const exposureScale = Math.max(1e-6, toFiniteNonNeg(cfg.exposureSec, 1));
      const sigma =
        (sigmaFlux * Math.max(1, airmass ** airmassExponent)) /
        Math.max(1, exposureScale ** exposureExponent);
      const factor = 1 + normalSample(state.rng, 0, sigma);
      observerTransmission *= Math.max(0, factor);
    }
  }

  fluxPreNoise *= observerTransmission;

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
    const skyCfg = observer?.enabled && atmosphere?.enabled ? atmosphere.skyBackground : undefined;
    const meanSkyElectrons =
      skyCfg?.enabled && exposureSec > 0
        ? Math.max(0, toFiniteNumber(skyCfg.electronsPerSec, 0)) * exposureSec
        : 0;
    const skyResidualFraction = clamp(toFiniteNumber(skyCfg?.subtractionResidualFraction, 0), 0, 1);

    // Photon noise
    let electrons = meanElectrons;
    if (cfg.photonNoise?.enabled || meanSkyElectrons > 0) {
      const sourceElectrons = sampleElectrons(meanElectrons, cfg.photonNoise, state);
      const skyElectrons = sampleElectrons(meanSkyElectrons, cfg.photonNoise, state);
      electrons =
        sourceElectrons + (skyElectrons - meanSkyElectrons) + meanSkyElectrons * skyResidualFraction;
    }

    // Read noise (Gaussian, e- RMS)
    if (cfg.readNoise?.enabled) {
      const s = toFiniteNonNeg(cfg.readNoise.sigmaElectrons, 0);
      if (s > 0) electrons += normalSample(state.rng, 0, s);
    }

    // Detector nonlinearity and CTI are applied after read noise rather than before.
    // Physically, nonlinearity occurs during charge accumulation and CTI during readout,
    // so both should precede additive read noise. However, for typical CTI coefficients
    // (~1e-4) and nonlinearity coefficients (~1e-6), the ordering effect is negligible.
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

  if (isGapSample(observer, t)) return Number.NaN;

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
