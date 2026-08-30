/** Owns app-level instrument-noise state construction and reset behavior. */
//
// Instrument-noise configuration helpers and state lifecycle.

import type { BrowserScenarioDraft } from "../domain/model/types";
import {
  createInstrumentNoiseState,
  type InstrumentNoiseState,
  type InstrumentNoiseSystematicsParams,
} from "../domain/photometry/instrumentNoise";

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

function readNoiseSeedFromParams(p: BrowserScenarioDraft): number {
  const ph = p.star.photometry;
  const cfg = getInstrumentCfgFromPhotometry(ph);
  const seed = cfg?.seed ?? 1;
  return Number.isFinite(seed) ? seed : 1;
}

export function initNoiseState(p: BrowserScenarioDraft): NoiseState {
  const noiseSeed = readNoiseSeedFromParams(p);
  return {
    noiseSeed,
    noiseState: createInstrumentNoiseState(noiseSeed),
  };
}

export function syncNoiseStateFromParams(state: NoiseState, p: BrowserScenarioDraft): NoiseState {
  const nextSeed = readNoiseSeedFromParams(p);
  // Object.is is used instead of === so that NaN === NaN would fail but Object.is(NaN, NaN)
  // returns true. This is harmless because seeds are always finite numbers in practice.
  if (Object.is(nextSeed, state.noiseSeed)) return state;
  return {
    noiseSeed: nextSeed,
    noiseState: createInstrumentNoiseState(nextSeed),
  };
}

export function resetNoiseStateWithSeed(noiseSeed: number): InstrumentNoiseState {
  return createInstrumentNoiseState(noiseSeed);
}
