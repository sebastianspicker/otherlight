/**
 * Owns transit Compute Budget support within the core layer. Keeps shared domain contracts independent of application and simulation orchestration.
 */
import type { SystemParams } from "./types";

/** Hard ceiling shared by every synchronous stellar-disk integrator. */
export const MAX_TRANSIT_GRID_RES = 1024;

/** Minimum grid resolution accepted by the browser parameter controls. */
export const MIN_TRANSIT_GRID_RES = 60;

/** Maximum spectral samples retained by the transit solver at low grid resolutions. */
export const MAX_SPECTRAL_SAMPLES = 256;

/**
 * Upper bound for stellar-disk point evaluations in one synchronous frame sample.
 *
 * This preserves the former 256-band capacity at a 64 x 64 grid while preventing
 * grid resolution, spectral bands, and cadence smearing from multiplying into an
 * unbounded main-thread workload.
 */
export const MAX_TRANSIT_POINT_EVALUATIONS = MAX_SPECTRAL_SAMPLES * 64 * 64;

/** Existing scientific cap retained for inexpensive smearing configurations. */
export const MAX_SMEARING_SUBSAMPLES = 512;

function normalizeTransitGridResolution(gridRes: unknown, fallback: number): number {
  const parsed = typeof gridRes === "number" ? gridRes : Number(gridRes);
  const finite = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(MIN_TRANSIT_GRID_RES, Math.min(MAX_TRANSIT_GRID_RES, Math.floor(finite)));
}

export function maxSpectralSamplesForGrid(gridRes: unknown, fallback = 220): number {
  const grid = normalizeTransitGridResolution(gridRes, fallback);
  return Math.max(
    1,
    Math.min(MAX_SPECTRAL_SAMPLES, Math.floor(MAX_TRANSIT_POINT_EVALUATIONS / (grid * grid))),
  );
}

function positiveSpectralSampleCount(values: unknown): number {
  if (!Array.isArray(values)) return 0;

  let count = 0;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) count += 1;
    if (count >= MAX_SPECTRAL_SAMPLES) break;
  }
  return count;
}

function hasTransmissionConfigured(params: SystemParams): boolean {
  const photometry = params.star.photometry;
  return Boolean(photometry?.atmosphereTransmission?.enabled || photometry?.atmosphereRT?.enabled);
}

function activeSpectralSampleCount(params: SystemParams, gridRes: number): number {
  const photometry = params.star.photometry;
  if (!hasTransmissionConfigured(params)) return 1;

  const bandpassSamples = photometry?.spectralBandpass?.enabled
    ? positiveSpectralSampleCount(photometry.spectralBandpass.lambdaNm)
    : 0;
  const configuredSamples =
    bandpassSamples > 0
      ? bandpassSamples
      : positiveSpectralSampleCount(photometry?.atmosphereTransmission?.lambdaNm);
  if (configuredSamples === 0) return 1;
  return Math.min(configuredSamples, maxSpectralSamplesForGrid(gridRes));
}

export function estimateTransitPointEvaluations(params: SystemParams): number {
  const fallbackGridRes = hasTransmissionConfigured(params) ? 256 : 220;
  const gridRes = normalizeTransitGridResolution(params.star.photometry?.gridRes, fallbackGridRes);
  return gridRes * gridRes * activeSpectralSampleCount(params, gridRes);
}

function maxSmearingSubsamplesForWork(workPerStep: number): number {
  const samplesAfterInstantaneousStep = Math.floor(MAX_TRANSIT_POINT_EVALUATIONS / workPerStep) - 1;
  return Math.max(1, Math.min(MAX_SMEARING_SUBSAMPLES, samplesAfterInstantaneousStep));
}

export function maxSmearingSubsamplesForGrid(gridRes: unknown): number {
  const grid = normalizeTransitGridResolution(gridRes, 220);
  return maxSmearingSubsamplesForWork(grid * grid);
}

/**
 * Maximum boxcar samples that fit after the already-computed instantaneous step.
 * A return value of 1 means callers should reuse that instantaneous value and skip
 * a second simulation step.
 */
export function maxSmearingSubsamplesForParams(params: SystemParams): number {
  return maxSmearingSubsamplesForWork(estimateTransitPointEvaluations(params));
}
