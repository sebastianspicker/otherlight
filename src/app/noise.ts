// src/app/noise.ts
//
// Instrument-noise configuration helpers and state lifecycle.

import type { SystemParams } from "../core/types";
import {
  createInstrumentNoiseState,
  type InstrumentNoiseState,
  type InstrumentNoiseSystematicsParams,
} from "../photometry/instrumentNoise";

export type NoiseState = {
  noiseSeed: number;
  noiseState: InstrumentNoiseState;
};

export function getInstrumentCfgFromPhotometry(ph: unknown): InstrumentNoiseSystematicsParams | undefined {
  if (!ph || typeof ph !== "object") return undefined;
  const rec = ph as Record<string, unknown>;

  // Canonical key in newer schema: photometry.instrument
  const cfgA = rec.instrument as InstrumentNoiseSystematicsParams | undefined;

  // Backwards-compat key: photometry.instrumentNoise
  const cfgB = rec.instrumentNoise as InstrumentNoiseSystematicsParams | undefined;

  return cfgA ?? cfgB;
}

function readNoiseSeedFromParams(p: SystemParams): number {
  const ph = p.star.photometry;
  const cfg = getInstrumentCfgFromPhotometry(ph);
  const seed = cfg?.seed ?? 1;
  return Number.isFinite(seed) ? seed : 1;
}

export function initNoiseState(p: SystemParams): NoiseState {
  const noiseSeed = readNoiseSeedFromParams(p);
  return {
    noiseSeed,
    noiseState: createInstrumentNoiseState(noiseSeed),
  };
}

export function syncNoiseStateFromParams(state: NoiseState, p: SystemParams): NoiseState {
  const nextSeed = readNoiseSeedFromParams(p);
  if (Object.is(nextSeed, state.noiseSeed)) return state;
  return {
    noiseSeed: nextSeed,
    noiseState: createInstrumentNoiseState(nextSeed),
  };
}

export function resetNoiseStateWithSeed(noiseSeed: number): InstrumentNoiseState {
  return createInstrumentNoiseState(noiseSeed);
}
