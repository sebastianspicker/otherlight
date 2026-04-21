// src/core/types.ts

//
// Core domain types for the simulation.
//
// -----------------------------------------------------------------------------
// Conventions (project-wide, source of truth)
// -----------------------------------------------------------------------------
//
// Units:
// - Lengths are meters (SI).
// - Time is seconds (SI).
// - Mass is kilograms (SI) where applicable.
// - Angles are radians.
//
// Coordinate / observer convention:
// - The star is at the inertial origin.
// - `observer.dir` is a line-of-sight direction vector in inertial coordinates that points
//   from the star toward the observer.
// - `projectToSky(r, observer.dir)` (see src/physics/frames.ts) returns (x,y) in the sky plane and
//   a depth coordinate z = dot(r, ez) where ez is the normalized observer direction.
//
// In this convention:
// - Larger sky.z means "closer to the observer" along the line of sight.
// - A body is considered "in front of the star" for transit/occultation purposes when
//   dot(rBody, observer.dir) > 0 (see src/sim/sim.ts).
//
// Photometry convention / flux composition (physically consistent contract):
// - Transit photometry returns a multiplicative stellar attenuation factor F_transit(t) in [0,1],
//   normalized to the unobscured stellar disk (including any modeled brightness map).
// - Flux components are separated into:
//   (A) Stellar terms (in stellar flux units):
//       F_star_preTransit(t) = baselineFlux + F_stellarVariability(t)
//       These terms represent the star’s own emitted light and ARE attenuated by transit.
//   (B) System additive terms not representing stellar surface light (in stellar units):
//       F_add_sys(t) = F_planetPhase(t) + F_moonPhase(t) + F_forwardScattering(t) + ... (optional future terms)
//       These are added after transit attenuation of the stellar component.
// - Recommended combined model:
//     F_total(t) = F_star_preTransit(t) * F_transit(t) + F_add_sys(t)
//   where baselineFlux defaults to 1.0 if omitted.

// Orbit / dynamics
export type { OrbitElements, OrbitElementsProvider } from "./typesOrbit";
export type {
  NBodyPlanetMoonParams,
  NBodyPerturberParams,
  RelativityParams,
  ExomoonTimingShapeParams,
  SystemDynamicsParams,
  FidelityProfile,
  RelativityLevel,
  IntegratorParams,
  IntegratorMode,
  CollisionPolicyParams,
  SecularEvolutionParams,
  PhysicsFeatureFlags,
} from "./typesDynamics";

// Observer / sky geometry
export type { Observer, SkyPoint } from "./typesObserver";

// Limb darkening
export type {
  PassbandId,
  LimbDarkeningConstraints,
  LimbDarkeningLawQuadratic,
  LimbDarkeningLawThreeParameter,
  LimbDarkeningLawFourParameter,
  LimbDarkeningLaw,
  LimbDarkeningModel,
  StellarLimbDarkeningParams,
} from "./typesLimbDarkening";

// Photometry config
export type {
  BrightnessPatchShape,
  BrightnessPatch,
  PhaseCurveParams,
  DayNightVisibilityParams,
  AtmosphereTransmissionParams,
  AtmosphereRTParams,
  AtmosphereRTLayer,
  SpectralBandpassParams,
  ThermalModelAdvancedParams,
  RingScatteringParams,
  AdditiveCompositionMode,
  StellarSurfaceParams,
  ForwardScatteringParams,
  StellarVariabilityParams,
  StellarVariabilityPhaseModel,
  SpotEvolutionParams,
  ThermalInertiaParams,
  PhotometryParams,
} from "./typesPhotometry";

// System
export type {
  Body,
  BinaryStarPhotometryParams,
  BinarySystemPhotometryParams,
  BodyShapeParams,
  RingSystemParams,
  BodySpinParams,
  BodyGravityHarmonicsParams,
  BodyTidesParams,
  SystemParamsV2,
  SystemParams,
} from "./typesSystem";

// Results
export type {
  StepMeta,
  StepResult,
  StepObservables,
  StepTimingDiagnostics,
  StepAdvancedTimingDiagnostics,
  StepTimingSolveDiagnostics,
  StepTimingSolveBundle,
  StepEventTimingSolveDiagnostics,
  StepEventTimingSolveBundle,
  StepConservationDiagnostics,
  StepFluxDecomposition,
} from "./typesResults";

// Didactics
export type {
  DidacticFormulaValue,
  AssessmentRule,
  DidacticInterpretation,
  DidacticResponseEntry,
  DidacticResponseStore,
  LessonFamily,
  LessonEventTarget,
  LessonFocusControl,
  LessonPhaseSpec,
  LessonPhaseType,
  LessonRecommendedUiMode,
  LessonResponseMode,
  LessonSignalSurface,
  LessonSimMode,
  LessonStep,
  LessonSpec,
  LessonWorkedExample,
  LearningState,
  DidacticCheckResult,
  DidacticSignals,
  RubricCriterionV2,
  AssessmentRubricV2,
  DidacticsParams,
} from "./typesDidactics";
