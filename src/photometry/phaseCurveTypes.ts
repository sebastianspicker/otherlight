/** Shared normalized and public configuration types for phase-curve evaluation. */
import type { DayNightVisibilityParams, PhaseCurveParams, ThermalModelAdvancedParams } from "../core/types";
import type { Vec3 } from "../physics/vec3";
import type { ReflectedPhaseModel, ThermalPhaseModel } from "./dayNightVisibility";

/**
 * Phase-curve configuration (phenomenological).
 *
 * All flux amplitudes are in stellar baseline units (dimensionless):
 * - reflAmp: reflected-light amplitude knob (no automatic radius/albedo scaling).
 * - thermAmp: thermal emission amplitude knob (no automatic radius/temperature scaling).
 * - constant: additive constant floor in stellar units.
 *
 * Backwards-compatibility:
 * - Fields mirror coretypes.PhaseCurveParams to keep JSON presets stable.
 */
export type PhaseCurveModel = PhaseCurveParams;

export type NormalizedThermalInertia = {
  enabled: boolean;
  albedo: number;
  emissivity: number;
  tauSec: number;
  redistribution: number;
};

export type NormalizedPhaseCurveModel = {
  enabled: boolean;
  reflAmp: number;
  thermAmp: number;
  reflOffset: number;
  thermOffset: number;
  lambertian: boolean;
  constant: number;
  reflModel?: ReflectedPhaseModel;
  thermalModel?: ThermalPhaseModel;
  clamp: boolean;
  physicalScaling: boolean;
  thermalInertia: NormalizedThermalInertia;
};

export type BodyPhaseFluxParams = {
  rBody: Vec3;
  rBodyRadius?: number;
  rStarRadius?: number;
  observerDir: Vec3;
  orbitPeriodSec?: number;
  model?: PhaseCurveModel;
  dayNightVisibility?: DayNightVisibilityParams;
  thermalModelAdvanced?: ThermalModelAdvancedParams;
  /** Optional multiplicative correction applied only to reflected-light flux. */
  reflectedFluxScale?: number;
};
