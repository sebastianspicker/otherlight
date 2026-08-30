/**
 * Owns forward Scattering Models support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import { clamp, isFiniteNumber } from "../model/units";
import type { ForwardScatteringFluxParams } from "./forwardScatteringTypes";
import type { ForwardScatteringContext } from "./forwardScatteringContext";
import { approximateCosScatteringAngle, henyeyGreensteinPhase, wrapPi } from "./forwardScatteringGeometry";

export function gaussianTimeForwardScatteringFlux(
  params: ForwardScatteringFluxParams,
  context: ForwardScatteringContext,
): number {
  const phase = isFiniteNumber(params.phase) ? params.phase : 0;
  const offset = isFiniteNumber(context.model.phaseOffset) ? context.model.phaseOffset : 0;
  const dphi = wrapPi(phase - offset);
  const shape = Math.exp(-(dphi * dphi) / (2 * context.sigmaClamped * context.sigmaClamped));
  return context.amp * shape;
}

export function hgAngleForwardScatteringFlux(
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

export function finalizeForwardScatteringFlux(flux: number, clampNonNegative: boolean): number {
  const clamped = clampNonNegative ? Math.max(0, flux) : flux;
  return isFiniteNumber(clamped) ? clamped : 0;
}

function normalizedHgShape(rawPhaseVal: number, peakPhaseVal: number): number {
  if (peakPhaseVal > 0) return rawPhaseVal / peakPhaseVal;
  return rawPhaseVal > 0 ? 1 : 0;
}
