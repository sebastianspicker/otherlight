/** Stable helper facade for stateful instrument-noise calculations. */
export { applyDetrend, computeDt, isGapSample } from "./instrumentNoiseDetrending";
export { applyDeterministicSystematics } from "./instrumentNoiseTrends";
export { applyCorrelatedNoise, ensureOneOverFBank } from "./instrumentNoiseCorrelated";
export { applyFluxDomainEffects } from "./instrumentNoiseFluxEffects";
export { currentAirmass } from "./instrumentNoiseFluxEffects";
export { applyElectronNoise, sampleElectrons } from "./instrumentNoiseElectronNoise";
