// src/photometry/random.ts
//
// Deterministic PRNG + sampling helpers for the measurement layer.
//
// This module is a stable import path for non-experimental code (e.g. instrumentNoise.ts).
// The underlying implementation lives in `src/experimental/photometry/random.ts` to keep
// all random-process utilities in one place.

export {
  bernoulli,
  createMulberry32,
  normal,
  ouStep,
  poisson,
  randomWalkStep,
  runRandomSelfTests,
  uniform,
  type PRNG,
} from "../experimental/photometry/random";
