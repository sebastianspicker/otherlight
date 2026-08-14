/** Shared mutable state and configuration types for instrument-noise synthesis. */
import type { PRNG } from "./random";

export type { InstrumentNoiseSystematicsParams } from "../core/instrumentNoiseTypes";

export type InstrumentNoiseState = {
  /** Seed used to (re-)initialize the RNG when requested. */
  seed: number;
  rng: PRNG;
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
