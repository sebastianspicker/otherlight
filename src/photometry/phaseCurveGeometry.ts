/**
 * Owns phase Curve Geometry support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import type { DayNightVisibilityParams } from "../core/types";
import { vIsFinite, vLen } from "../physics/vec3";
import type { ReflectedPhaseModel, ThermalPhaseModel } from "./dayNightVisibility";
import { phaseAngleRadFromBodyPos } from "./dayNightVisibility";
import type { BodyPhaseFluxParams, NormalizedPhaseCurveModel } from "./phaseCurveTypes";

export function bodyPhaseAlpha(params: BodyPhaseFluxParams): number | undefined {
  if (!vIsFinite(params.rBody) || !vIsFinite(params.observerDir)) return undefined;
  if (vLen(params.rBody) < 1e-15) return undefined;
  const alpha = phaseAngleRadFromBodyPos(params.rBody, params.observerDir);
  return Number.isFinite(alpha) ? alpha : undefined;
}

export function reflectedModelFor(
  norm: NormalizedPhaseCurveModel,
  dn: DayNightVisibilityParams | undefined,
): ReflectedPhaseModel {
  if (dn?.enabled) return (dn.reflectedModel ?? "lambert") as ReflectedPhaseModel;
  return (norm.reflModel ?? (norm.lambertian ? "lambert" : "cosine")) as ReflectedPhaseModel;
}

export function thermalModelFor(
  norm: NormalizedPhaseCurveModel,
  dn: DayNightVisibilityParams | undefined,
): ThermalPhaseModel {
  if (dn?.enabled) return (dn.thermalModel ?? "constant") as ThermalPhaseModel;
  return (norm.thermalModel ?? "cosine") as ThermalPhaseModel;
}

export function clampWeightsFor(
  norm: NormalizedPhaseCurveModel,
  dn: DayNightVisibilityParams | undefined,
): boolean {
  return dn?.enabled ? dn.clamp !== false : norm.clamp;
}
