/** Models additive forward-scattering brightening near transit. */

//
// Forward-scattering "pre/post transit brightening" toy models.
//
// Purpose
// - Provide an additive flux component (in stellar flux units) that can increase the observed flux
//   near transit due to strongly forward-scattering aerosols/dust/haze.
// - This is complementary to transmission/absorption (multiplicative dimming) handled elsewhere.
//
// Scientific notes (minimal but physically grounded)
// - Forward scattering is often parameterized by an anisotropic phase function.
// - A common analytic approximation for single-scattering angular distribution is the
//   Henyey–Greenstein (HG) phase function with asymmetry parameter g in (-1,1),
//   where g>0 is forward-peaked. (Normalized over 4π steradians.)
// - Real transit forward-scattering depends on dust distribution, optical depth, and star's finite angular size.
//   This file intentionally uses robust phenomenological models suitable for interactive simulation.
//
// Design goals
// - Plain-data friendly: the model is specified by numbers and enums.
// - Safe numerics: clamps and guards against NaN/Inf.
// - Backwards compatible: if disabled or missing parameters, returns 0.
//
// Units
// - All outputs are additive flux in "stellar units" (baseline star ~ 1).
// - Geometry uses vectors in the simulation's length units; only directions/angles matter here.

import { clamp, isFiniteNumber } from "../model/units";
import type { Vec3 } from "../orbits/vec3";
import { vDot, vIsFinite, vNormalizeOrThrow } from "../orbits/vec3";

type ForwardScatteringModel = {
  enabled?: boolean;
  amp?: number;
  kind?: "hg-angle" | "gaussian-time";
  g?: number;
  sigmaPhase?: number;
  phaseOffset?: number;
  clampNonNegative?: boolean;
  gateWhenBehindStar?: boolean;
};

export type ForwardScatteringFluxParams = {
  rBody: Vec3;
  observerDir: Vec3;
  model?: ForwardScatteringModel;
  phase?: number;
};

type ForwardScatteringContext = {
  model: ForwardScatteringModel;
  amp: number;
  observerDirUnit: Vec3;
  kind: "hg-angle" | "gaussian-time";
  sigmaClamped: number;
  clampNonNegative: boolean;
  gateWhenBehindStar: boolean;
};

function normalizedObserverDirection(observerDir: Vec3): Vec3 | undefined {
  try {
    return vNormalizeOrThrow(observerDir, 1e-15, "observerDir must be non-zero.");
  } catch {
    return undefined;
  }
}

function resolveForwardScatteringContext(
  params: ForwardScatteringFluxParams,
): ForwardScatteringContext | undefined {
  const model = params.model;
  if (!model?.enabled) return undefined;
  const amp = isFiniteNumber(model.amp) ? model.amp : 0;
  if (!(amp > 0)) return undefined;
  const observerDirUnit = normalizedObserverDirection(params.observerDir);
  if (!observerDirUnit) return undefined;
  const sigma = isFiniteNumber(model.sigmaPhase) ? model.sigmaPhase : 0.15;
  return {
    model,
    amp,
    observerDirUnit,
    kind: model.kind ?? "hg-angle",
    sigmaClamped: clamp(sigma, 1e-6, Math.PI),
    clampNonNegative: model.clampNonNegative !== false,
    gateWhenBehindStar: model.gateWhenBehindStar !== false,
  };
}

function passesForwardScatteringGate(
  params: ForwardScatteringFluxParams,
  context: ForwardScatteringContext,
): boolean {
  if (!context.gateWhenBehindStar) return true;
  return vDot(params.rBody, context.observerDirUnit) > 0;
}

/**
 * Numerically stable "wrap to [-π, π]" for phase differences.
 */
function wrapPi(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.atan2(Math.sin(x), Math.cos(x));
}

/**
 * Henyey-Greenstein phase function p(theta), normalized over 4pi.
 */
function henyeyGreensteinPhase(g: number, cosTheta: number): number {
  const gg = clamp(g, -0.999, 0.999);
  const mu = clamp(cosTheta, -1, 1);
  const denom = 1 + gg * gg - 2 * gg * mu;
  const d = Math.max(1e-12, denom);
  const p = (1 / (4 * Math.PI)) * ((1 - gg * gg) / Math.pow(d, 1.5));
  return Number.isFinite(p) ? p : 0;
}

function normalizedBodyDirection(rBody: Vec3): Vec3 | undefined {
  try {
    return vNormalizeOrThrow(rBody, 1e-15, "rBody must be non-zero for scattering angle.");
  } catch {
    return undefined;
  }
}

/**
 * Approximate scattering angle for "forward scattering around transit".
 */
function approximateCosScatteringAngle(rBody: Vec3, observerDirUnit: Vec3): number {
  if (!vIsFinite(rBody)) return 0;
  const rHat = normalizedBodyDirection(rBody);
  if (!rHat) return 0;
  const cosTheta = vDot(rHat, observerDirUnit);
  return clamp(cosTheta, -1, 1);
}

function normalizedHgShape(rawPhaseVal: number, peakPhaseVal: number): number {
  if (peakPhaseVal > 0) return rawPhaseVal / peakPhaseVal;
  return rawPhaseVal > 0 ? 1 : 0;
}

function gaussianTimeForwardScatteringFlux(
  params: ForwardScatteringFluxParams,
  context: ForwardScatteringContext,
): number {
  const phase = isFiniteNumber(params.phase) ? params.phase : 0;
  const offset = isFiniteNumber(context.model.phaseOffset) ? context.model.phaseOffset : 0;
  const dphi = wrapPi(phase - offset);
  const shape = Math.exp(-(dphi * dphi) / (2 * context.sigmaClamped * context.sigmaClamped));
  return context.amp * shape;
}

function hgAngleForwardScatteringFlux(
  params: ForwardScatteringFluxParams,
  context: ForwardScatteringContext,
): number {
  const cosTheta0 = approximateCosScatteringAngle(params.rBody, context.observerDirUnit);
  const offset = isFiniteNumber(context.model.phaseOffset) ? context.model.phaseOffset : 0;
  const cosTheta = Math.cos(Math.acos(cosTheta0) + offset);
  const g = isFiniteNumber(context.model.g) ? context.model.g : 0.8;
  const rawPhaseVal = henyeyGreensteinPhase(g, cosTheta);
  const peakPhaseVal = henyeyGreensteinPhase(g, 1.0);
  const hgShape = normalizedHgShape(rawPhaseVal, peakPhaseVal);
  const theta = Math.acos(clamp(cosTheta, -1, 1));
  const widthEnvelope = Math.exp(-(theta * theta) / (2 * context.sigmaClamped * context.sigmaClamped));
  return context.amp * hgShape * widthEnvelope;
}

function finalizeForwardScatteringFlux(flux: number, clampNonNegative: boolean): number {
  const clamped = clampNonNegative ? Math.max(0, flux) : flux;
  return isFiniteNumber(clamped) ? clamped : 0;
}

/**
 * Additive forward-scattering flux (stellar units).
 *
 * Intended usage in sim.ts:
 * F_total = (baseline + variability) * F_transit + (phaseCurve + forwardScattering)
 */
export function computeForwardScatteringFlux(params: ForwardScatteringFluxParams): number {
  const context = resolveForwardScatteringContext(params);
  if (!context) return 0;
  if (!passesForwardScatteringGate(params, context)) return 0;
  const flux =
    context.kind === "gaussian-time"
      ? gaussianTimeForwardScatteringFlux(params, context)
      : hgAngleForwardScatteringFlux(params, context);
  return finalizeForwardScatteringFlux(flux, context.clampNonNegative);
}
