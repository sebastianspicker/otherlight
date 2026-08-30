/**
 * Owns forward Scattering Context support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import { clamp, isFiniteNumber } from "../model/units";
import type { Vec3 } from "../orbits/vec3";
import { vDot } from "../orbits/vec3";
import type { ForwardScatteringFluxParams, ForwardScatteringModel } from "./forwardScatteringTypes";
import { normalizedObserverDirection } from "./forwardScatteringObserver";

export type ForwardScatteringContext = {
  model: ForwardScatteringModel;
  amp: number;
  observerDirUnit: Vec3;
  kind: "hg-angle" | "gaussian-time";
  sigmaClamped: number;
  clampNonNegative: boolean;
  gateWhenBehindStar: boolean;
};

export function resolveForwardScatteringContext(
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

export function passesForwardScatteringGate(
  params: ForwardScatteringFluxParams,
  context: ForwardScatteringContext,
): boolean {
  if (!context.gateWhenBehindStar) return true;
  return vDot(params.rBody, context.observerDirUnit) > 0;
}
