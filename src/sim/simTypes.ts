/** Defines internal geometry, flux, observable, and timing pipeline contracts. */
import type { StepAdvancedTimingDiagnostics, StepTimingDiagnostics } from "../core/types";
import type { computeAdditiveFluxComponents } from "./additiveFlux";
import type { computeBodyKinematics } from "./kinematics";
import type { buildOcculters } from "./occulters";
import type { computeStepObservables } from "./observables";
import type { getObserverDir } from "./observerContract";
import type { computeExoDiagnostics } from "./diagnostics";
import type { computeTransitTimingDiagnostics } from "./transitTiming";

export type ObserverDir = ReturnType<typeof getObserverDir>;
export type BodyKinematicsState = ReturnType<typeof computeBodyKinematics>;
export type StepObservablesResult = ReturnType<typeof computeStepObservables>;
export type TransitTimingResult = ReturnType<typeof computeTransitTimingDiagnostics>;

export type StepGeometry = {
  observerDir: ObserverDir;
  kin: BodyKinematicsState;
  occulters: ReturnType<typeof buildOcculters>;
};

export type StepFluxTerms = {
  baselineFluxUsed: number;
  fluxTransitFactor: number;
  fluxStellarPreTransit: number;
  fluxTotal: number;
  fluxStellarVar: number;
  fluxPlanetPhase: number;
  fluxMoonPhase: number;
  fluxForwardScattering: number;
  fluxRingScattering: number;
  fluxRefraction: number;
  additive: ReturnType<typeof computeAdditiveFluxComponents>;
};

export type StepTimingBundle = {
  exoDiag: ReturnType<typeof computeExoDiagnostics>;
  dynamicTiming: TransitTimingResult;
  advancedTiming: StepAdvancedTimingDiagnostics | undefined;
  observables: StepObservablesResult;
  timing: StepTimingDiagnostics | undefined;
  conservation: NonNullable<StepObservablesResult>["conservation"] | undefined;
};
