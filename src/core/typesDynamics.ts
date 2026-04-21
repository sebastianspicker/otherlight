// src/core/typesDynamics.ts

//
// Optional non-Kepler dynamics hooks/config.
//

import type { OrbitElements, OrbitElementsProvider } from "./typesOrbit";

export type FidelityProfile = "interactive" | "accurate" | "reference";

export type RelativityLevel = "toy" | "enhanced";

export type IntegratorMode = "fixed-verlet" | "adaptive-verlet";

export type IntegratorParams = {
  /**
   * Integrator family.
   * - fixed-verlet: deterministic fixed-step Velocity-Verlet (legacy behavior).
   * - adaptive-verlet: step-size control via local two-halfstep error estimate.
   */
  mode?: IntegratorMode;
  /** Absolute local position error target used by adaptive mode (simulation length units). */
  errorTolAbs?: number;
  /** Minimum allowed adaptive substep [s]. */
  dtMin?: number;
  /** Maximum substeps allowed for one integrateToTime call. */
  maxSubsteps?: number;
  /** Growth factor for accepted steps in adaptive mode (default ~1.5). */
  growthFactor?: number;
  /** Shrink factor for rejected steps in adaptive mode (default ~0.5). */
  shrinkFactor?: number;
};

export type CollisionPolicyParams = {
  enabled?: boolean;
  /**
   * Pairwise distance threshold [m] used for close-encounter detection.
   * If <= 0 or absent, policy is effectively disabled.
   */
  minSeparation?: number;
  /** Behavior when a close encounter is detected. */
  onCloseEncounter?: "warn" | "abort";
};

export type SecularEvolutionParams = {
  enabled?: boolean;
  /** Apply J2-driven apsidal/nodal precession in Kepler mode. */
  j2Precession?: boolean;
  /** Apply a lightweight tidal secular model in Kepler mode. */
  tides?: boolean;
  /** Reference epoch used by secular drifts [s]. */
  tRef?: number;
};

export type PhysicsFeatureFlags = {
  observables?: boolean;
  stellarSurface?: boolean;
  atmosphereRT?: boolean;
  nonSphericalFlux?: boolean;
  thermalEnergyBalance?: boolean;
  detectorRealism?: boolean;
};

export type RelativityParams = {
  enabled?: boolean;
  /** Apply light-travel time effect (LTTE) timing correction. */
  ltte?: boolean;
  /** Apply apsidal precession (toy GR). */
  grPrecession?: boolean;
  /** Apply Shapiro delay (gravitational time delay). */
  shapiro?: boolean;
  /** Apply a bounded weak-field Einstein-delay surrogate. */
  einsteinDelay?: boolean;
  /** Report a weak-field light-bending scale surrogate. */
  lightBending?: boolean;
  /** Speed of light in SI units [m/s]. */
  c?: number;
  /** Reference epoch for bounded advanced timing surrogates [s]. */
  timingRefSec?: number;
  /** Planet apsidal precession per orbit [rad/orbit]. */
  planetPrecessionPerOrbit?: number;
  /** Moon apsidal precession per orbit [rad/orbit]. */
  moonPrecessionPerOrbit?: number;
  /** Iterations for LTTE fixed-point solve. */
  ltteIters?: number;
  /** Convergence tolerance for LTTE [s]. */
  ltteTolSec?: number;
  /** Optional minimum impact parameter used to regularize Shapiro delay [m]. */
  shapiroMinImpact?: number;
};

export type NBodyPerturberParams = {
  enabled?: boolean;

  /** Gravitational parameter mu = G*M for the perturber (must be > 0). */
  mu?: number;

  /** Optional mass in kg. If mu is omitted, mu = G * m is used. */
  m?: number;

  /** Perturber orbit elements used as initial conditions (dynamically integrated afterward). */
  orbit?: OrbitElements | OrbitElementsProvider;
};

export type NBodyPlanetMoonParams = {
  enabled?: boolean;

  /** Gravitational parameter mu = G*M for the star (must be > 0). */
  muStar?: number;

  /** Gravitational parameter mu = G*M for the planet (must be > 0). */
  muPlanet?: number;

  /** Gravitational parameter mu = G*M for the moon (must be > 0). */
  muMoon?: number;

  /** Optional star mass in kg. If muStar is omitted, muStar = G * mStar is used. */
  mStar?: number;

  /** Optional planet mass in kg. If muPlanet is omitted, muPlanet = G * mPlanet is used. */
  mPlanet?: number;

  /** Optional moon mass in kg. If muMoon is omitted, muMoon = G * mMoon is used. */
  mMoon?: number;

  /** Recommended maximum absolute substep dt in seconds. */
  dtMax?: number;

  /**
   * Optional Plummer softening length in sim length units.
   * Purpose: Prevents numerical singularities (forces -> infinity) during close encounters/collisions.
   *
   * Typical values:
   * - ~1-10% of the smallest body's physical radius.
   * - Setting this too large acts as a "force shield" reducing gravity at close range.
   * - Setting this too small allows huge accelerations that break integration stability.
   */
  softening?: number;

  /** If true, throw on overlapping bodies when softening == 0 (debug/strict). */
  throwOnOverlap?: boolean;

  /** Optional per-config integrator override for N-body integration. */
  integrator?: IntegratorParams;

  /** Optional external perturbers (mutually coupled, full N-body integration). */
  perturbers?: NBodyPerturberParams[];
};

/** Data-driven exomoon timing/shape configuration. */
export type ExomoonTimingShapeParams = {
  enabled?: boolean;

  /** Reference epoch for evolution and for “relative to ref” diagnostics. Default: 0. */
  tRef?: number;

  /** Finite-difference time step [s] used when estimating projected sky-plane speeds. */
  velDt?: number;

  // --- Moon orbit orientation evolution (applied to moon.orbitAroundPlanet) ---
  // Field mapping to OrbitOrientationEvolution (src/physics/exomoonTiming.ts):
  //   moonOmegaDot      → OmegaDot      (nodal precession dΩ/dt)
  //   moonOmegaSmallDot → omegaDot      (apsidal precession dω/dt)
  //   moonIncDot        → incDot        (inclination drift di/dt)
  moonOmegaDot?: number; // dΩ/dt [rad/s]
  moonIncDot?: number; // di/dt [rad/s]
  moonOmegaSmallDot?: number; // dω/dt [rad/s]

  moonOmega0?: number;
  moonInc0?: number;
  moonOmegaSmall0?: number;

  /** Optional extra drift in the moon’s sky-plane y direction [units/s] (phenomenological). */
  moonImpactYDot?: number;
};

export type SystemDynamicsParams = {
  /** Optional dynamics configuration (beyond the Kepler/barycenter model). */
  nbodyPlanetMoon?: NBodyPlanetMoonParams;
  exomoonTimingShape?: ExomoonTimingShapeParams;
  relativity?: RelativityParams;
  /** Fidelity profile for performance/accuracy feature gates. */
  fidelityProfile?: FidelityProfile;
  /** Opt-in feature switches for advanced physics modules (all optional/off by default). */
  physicsFeatures?: PhysicsFeatureFlags;
  /** Global integrator settings (overridden by nbodyPlanetMoon.integrator where provided). */
  integrator?: IntegratorParams;
  /** Optional secular evolution hooks (Kepler-mode). */
  secular?: SecularEvolutionParams;
  /** Optional close-encounter policy for robust runs. */
  collisionPolicy?: CollisionPolicyParams;
  /** Relativity model level. Default: "toy" for backwards compatibility. */
  relativityLevel?: RelativityLevel;
};
