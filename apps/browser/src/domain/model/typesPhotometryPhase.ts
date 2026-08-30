/**
 * Owns types Photometry Phase support within the core layer. Keeps shared domain contracts independent of application and simulation orchestration.
 */
export type ThermalInertiaParams = {
  enabled?: boolean;
  albedo?: number;
  emissivity?: number;
  thermalTimescaleSec?: number;
  redistribution?: number;
};

export type PhaseCurveParams = {
  enabled?: boolean;
  reflAmp?: number;
  thermAmp?: number;
  reflOffset?: number;
  thermOffset?: number;
  constant?: number;
  reflModel?: "lambert" | "cosine";
  thermalModel?: "constant" | "lambert" | "cosine";
  lambertian?: boolean;
  clamp?: boolean;
  physicalScaling?: boolean;
  thermalInertia?: ThermalInertiaParams;
};

export type DayNightVisibilityParams = {
  enabled?: boolean;
  reflectedModel?: "lambert" | "cosine";
  thermalModel?: "constant" | "lambert" | "cosine";
  clamp?: boolean;
};

export type ThermalModelAdvancedParams = {
  enabled?: boolean;
  equilibriumScale?: number;
  redistribution?: number;
  tauSec?: number;
};

export type RingScatteringParams = {
  enabled?: boolean;
  amp?: number;
  sigmaPhase?: number;
};

export type AdditiveCompositionMode = "legacy-free-stacking" | "higher-fidelity-coupled";
