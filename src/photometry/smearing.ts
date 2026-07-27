/** Integrates finite exposure time so rapid flux variation is observationally smeared. */

//
// Finite integration time / exposure smearing utilities.
//
// Purpose
// - Real photometric measurements integrate flux over a finite exposure time (cadence).
// - If the underlying light curve varies during the exposure (e.g., ingress/egress),
//   the measured flux is the time-average over that interval.
//
// Boxcar exposure model (centered exposure):
// - The exposure is modeled as a uniform ("boxcar") time average over:
//   [tCenter - cadenceSec/2, tCenter + cadenceSec/2].
//
// Subsampling / quadrature:
// - Uses midpoint rule over N equal sub-intervals (deterministic):
//   dt = cadenceSec / N, tStart = tCenter - cadenceSec/2
//   ti = tStart + (i + 0.5) * dt, i=0..N-1
//
// NaN / non-finite behavior:
// - If smearing is disabled: returns instantaneous fluxAt(tCenter) (finite -> value; non-finite -> 0).
// - If smearing is enabled: non-finite subsample values are handled per policy:
//   - "ignore" (default): ignore non-finite subsamples; if all are non-finite, fall back to instantaneous.
//   - "zero": treat non-finite subsamples as 0 (keeps N constant, may bias average downward).
//
// Clamp policy:
// - IMPORTANT: This is only scientifically appropriate if the smeared quantity is a
//   normalized transit-like stellar flux that is physically constrained to [0,1]
//   (e.g. a pure attenuation factor, or a star-only normalized light curve without additive terms).
// - It is NOT appropriate for total-flux models that include additive components
//   (planet/moon phase light, stellar variability, etc.), because those can legitimately
//   produce flux > 1; clamping would bias the measurement downward.

import { clamp, clamp01, toFiniteNumber } from "../core/units";

export type FluxAtTime = (tSec: number) => number;

export type SmearingConfig = {
  /**
   * Exposure/integration time in seconds (boxcar width).
   * If <= 0 or not finite, smearing is treated as disabled.
   */
  cadenceSec?: number;

  /**
   * Number of sub-samples used to approximate the boxcar integral.
   * If <= 1, smearing is treated as disabled.
   */
  nSubsamples?: number;

  /**
   * Optional hard cap to avoid extreme CPU usage from UI mistakes.
   * If omitted, a conservative internal default is used.
   */
  maxSubsamples?: number;

  /**
   * If true, clamp returned flux into [0,1].
   * Use ONLY when the smeared quantity is known a priori to be physically in [0,1]
   * (normalized transit-like signal / attenuation factor).
   * Do NOT use when smearing a total flux that may exceed 1 due to additive components.
   */
  clamp01?: boolean;

  /**
   * Behavior if fluxAt(...) returns non-finite values:
   * - "ignore" (default): ignore non-finite subsamples; fall back to instantaneous value if all are bad.
   * - "zero": treat non-finite subsamples as 0 (keeps N constant, but biases averages downward).
   *
   * Scientific Note: "zero" policy biases the mean downward. Use "ignore" for robust handling of occasional NaNs.
   */
  nonFinitePolicy?: "ignore" | "zero";
};

function normalizeSmearingConfig(cfg: SmearingConfig | undefined): {
  cadenceSec: number;
  nSubsamples: number;
  clampTo01: boolean;
  nonFinitePolicy: "ignore" | "zero";
} {
  const cadenceSec = toFiniteNumber(cfg?.cadenceSec, 0);
  const nRaw = toFiniteNumber(cfg?.nSubsamples, 1);
  const maxN = Math.max(1, Math.floor(toFiniteNumber(cfg?.maxSubsamples, 512)));

  const nSubsamples = clamp(Math.floor(nRaw), 1, maxN);
  const clampTo01 = Boolean(cfg?.clamp01);
  const nonFinitePolicy: "ignore" | "zero" = cfg?.nonFinitePolicy === "zero" ? "zero" : "ignore";

  return {
    cadenceSec: Number.isFinite(cadenceSec) ? cadenceSec : 0,
    nSubsamples,
    clampTo01,
    nonFinitePolicy,
  };
}

function maybeClampFlux(value: number, clampTo01: boolean): number {
  return clampTo01 ? clamp01(value) : value;
}

function instantaneousFlux(fluxAt: FluxAtTime, tSec: number, clampTo01: boolean): number {
  const f0 = fluxAt(tSec);
  const out0 = Number.isFinite(f0) ? f0 : 0;
  return maybeClampFlux(out0, clampTo01);
}

function smearingDisabled(cadenceSec: number, nSubsamples: number): boolean {
  return !Number.isFinite(cadenceSec) || cadenceSec <= 0 || !Number.isFinite(nSubsamples) || nSubsamples <= 1;
}

function normalizedSubsampleCount(nSubsamples: number): number {
  return Math.max(2, Math.floor(nSubsamples));
}

function accumulateBoxcarSamples(params: {
  fluxAt: FluxAtTime;
  tStart: number;
  dt: number;
  count: number;
  nonFinitePolicy: "ignore" | "zero";
}): { sum: number; count: number } {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < params.count; i++) {
    const fi = params.fluxAt(params.tStart + (i + 0.5) * params.dt);
    if (Number.isFinite(fi)) {
      sum += fi;
      count++;
    } else if (params.nonFinitePolicy === "zero") {
      count++;
    }
  }
  return { sum, count };
}

function averagedOrInstantaneous(
  samples: { sum: number; count: number },
  fluxAt: FluxAtTime,
  tCenterSec: number,
): number {
  if (samples.count > 0) return samples.sum / samples.count;
  const f0 = fluxAt(tCenterSec);
  return Number.isFinite(f0) ? f0 : 0;
}

/**
 * Compute a deterministic boxcar-averaged flux centered at tCenterSec, using midpoint subsampling.
 *
 * Returns:
 * - If smearing disabled (cadenceSec<=0 or N<=1): returns fluxAt(tCenterSec) (non-finite -> 0).
 * - Otherwise: average of fluxAt(ti) over subsamples (with non-finite policy applied).
 */
export function boxcarAverageFlux(
  fluxAt: FluxAtTime,
  tCenterSec: number,
  cadenceSec: number,
  nSubsamples: number,
  opts?: { clampTo01?: boolean; nonFinitePolicy?: "ignore" | "zero" },
): number {
  if (!Number.isFinite(tCenterSec)) {
    // Deterministic simulation requires a finite time coordinate.
    throw new Error("boxcarAverageFlux: tCenterSec must be finite.");
  }

  const clampTo01Opt = Boolean(opts?.clampTo01);
  const nonFinitePolicy: "ignore" | "zero" = opts?.nonFinitePolicy === "zero" ? "zero" : "ignore";

  if (smearingDisabled(cadenceSec, nSubsamples)) return instantaneousFlux(fluxAt, tCenterSec, clampTo01Opt);

  const N = normalizedSubsampleCount(nSubsamples);
  const dt = cadenceSec / N;
  const tStart = tCenterSec - 0.5 * cadenceSec;
  const samples = accumulateBoxcarSamples({ fluxAt, tStart, dt, count: N, nonFinitePolicy });
  return maybeClampFlux(averagedOrInstantaneous(samples, fluxAt, tCenterSec), clampTo01Opt);
}

/**
 * Convenience wrapper: apply smearing if enabled in config, else return instantaneous flux.
 */
export function smearedFluxAt(
  fluxAt: FluxAtTime,
  tCenterSec: number,
  cfg: SmearingConfig | undefined,
): number {
  const norm = normalizeSmearingConfig(cfg);
  return boxcarAverageFlux(fluxAt, tCenterSec, norm.cadenceSec, norm.nSubsamples, {
    clampTo01: norm.clampTo01,
    nonFinitePolicy: norm.nonFinitePolicy,
  });
}
