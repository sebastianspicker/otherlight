/** Shared configuration and evaluation inputs for phenomenological forward scattering. */
import type { Vec3 } from "../physics/vec3";

export type ForwardScatteringModel = {
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
