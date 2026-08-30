/** Defines simulation result, diagnostic, and observable output contracts. */

//
// Types for simulation outputs (one step).
//

import type { SkyPoint } from "./typesObserver";
import type { DidacticSignals } from "./typesDidactics";

export type StepTimingDiagnostics = {
  lttePlanetSec?: number;
  ltteMoonSec?: number;
  shapiroPlanetSec?: number;
  shapiroMoonSec?: number;
  einsteinPlanetSec?: number;
  einsteinMoonSec?: number;
  barycentricClockOffsetSec?: number;
  planetTransitCenterSec?: number;
  planetTransitDurationSec?: number;
  planetIngressSec?: number;
  planetEgressSec?: number;
  planetTtvSec?: number;
  moonTransitCenterSec?: number;
  moonTransitDurationSec?: number;
  moonIngressSec?: number;
  moonEgressSec?: number;
  moonTtvSec?: number;
};

export type StepAdvancedTimingDiagnostics = {
  einsteinPlanetSec?: number;
  einsteinMoonSec?: number;
  barycentricClockOffsetSec?: number;
  lightBendingPlanetRad?: number;
  lightBendingMoonRad?: number;
  closeEncounterDistance?: number;
  validityFlags?: string[];
};

export type StepTimingSolveDiagnostics = {
  status: "converged" | "max-iters" | "invalid-input" | "nonfinite-delay" | "nonfinite-next";
  converged: boolean;
  iterations: number;
  maxIters: number;
  tolSec: number;
  usedShapiro: boolean;
  usedMultiBodyShapiro: boolean;
  validityFlags: string[];
  roemerSec?: number;
  shapiroSec?: number;
  delaySec?: number;
  residualSec?: number;
};

export type StepTimingSolveBundle = {
  planet?: StepTimingSolveDiagnostics;
  moon?: StepTimingSolveDiagnostics;
};

export type StepEventTimingSolveDiagnostics = {
  status: "linear-estimate" | "exact" | "fallback-linear" | "invalid-input";
  converged: boolean;
  usedExact: boolean;
  centerIterations: number;
  ingressIterations: number;
  egressIterations: number;
  validityFlags: string[];
};

export type StepEventTimingSolveBundle = {
  planet?: StepEventTimingSolveDiagnostics;
  moon?: StepEventTimingSolveDiagnostics;
};

export type StepConservationDiagnostics = {
  energy?: number;
  angularMomentum?: number;
};

export type StepFluxDecomposition = {
  stellarA?: number;
  stellarB?: number;
  binaryEclipseTerms?: number;
  additivePlanetary?: number;
  additiveLunar?: number;
  instrumental?: number;
  stellarPreTransit?: number;
  stellarVariability?: number;
  transitFactor?: number;
  planetPhase?: number;
  moonPhase?: number;
  forwardScattering?: number;
  ringScattering?: number;
  refraction?: number;
  total?: number;
};

export type StepObservables = {
  /** Radial velocity of the star along line of sight [m/s]. */
  rvStar?: number;
  /** Radial velocity of the planet along line of sight [m/s]. */
  rvPlanet?: number;
  /** Radial velocity of the moon along line of sight [m/s]. */
  rvMoon?: number;
  /** Astrometric sky-plane offset of the star [m]. */
  astrometricOffsetStar?: { x: number; y: number };
  /** Timing diagnostics in seconds. */
  timing?: StepTimingDiagnostics;
  /** N-body conservation diagnostics (if available). */
  conservation?: StepConservationDiagnostics;
};

export type StepMeta = {
  /** Simulation time [s]. */
  t: number;

  /** Number of occulters currently considered in front of the star. */
  nOcculters?: number;

  /** Fraction of the planet disk visible when occulted by the moon (mutual events). */
  planetVisibleFraction?: number;

  /** Fraction of the moon disk visible when occulted by the planet (mutual events). */
  moonVisibleFraction?: number;

  /** Additive stellar variability term in stellar units. */
  stellarVariabilityFlux?: number;

  /** Additive forward-scattering term in stellar units. */
  forwardScatteringFlux?: number;
  /** Additive ring-scattering term in stellar units. */
  ringScatteringFlux?: number;

  /** Baseline flux used (defaults to 1.0 when photometry.baselineFlux is absent). */
  baselineFluxUsed?: number;

  /** Flux value after applying the same display normalization the UI plot uses. */
  displayFluxValue?: number;

  /** Planet sky-plane speed diagnostic (units/s). */
  vPlanetSky?: number;

  /** Reference planet sky-plane speed diagnostic (units/s). */
  vPlanetSkyRef?: number;

  /** TDV-like ratio diagnostic (dimensionless). */
  tdvRatio?: number;

  /** Front-of-star projected impact parameter b = sqrt(x^2 + y^2) / R*. */
  bPlanet?: number;

  /** Front-of-star projected impact parameter b = sqrt(x^2 + y^2) / R*. */
  bMoon?: number;

  /** Optional advanced observables bundle (RV, astrometry, timing, conservation). */
  observables?: StepObservables;

  /** Flattened timing diagnostics (for direct dashboard usage). */
  timing?: StepTimingDiagnostics;
  /** Additional bounded advanced timing and dynamical-limit diagnostics. */
  advancedTiming?: StepAdvancedTimingDiagnostics;
  /** LTTE/Shapiro solver convergence metadata when timing correction is solved explicitly. */
  timingConvergence?: StepTimingSolveBundle;
  /** Transit-event/contact solver diagnostics for planet and moon timing products. */
  eventTimingConvergence?: StepEventTimingSolveBundle;
  /** Flattened conservation diagnostics (for direct dashboard usage). */
  conservation?: StepConservationDiagnostics;
  /** Explicit flux-decomposition bundle for didactics/debugging. */
  fluxDecomposition?: StepFluxDecomposition;
  /** Didactic overlays/check signals. */
  didacticSignals?: DidacticSignals;
};

/**
 * Result of one simulation step at time t.
 *
 * Flux fields (new, unambiguous contract):
 * - fluxTotal: final combined flux output used by plots/rendering.
 * - fluxTransitFactor: stellar attenuation factor in [0,1] (if computed).
 * - fluxStellarPreTransit: baselineFlux + stellar variability (stellar units).
 * - fluxStellarVar: additive stellar variability term only (stellar units).
 * - fluxPlanetPhase: additive planet phase/self-flux term (stellar units).
 * - fluxMoonPhase: additive moon phase/self-flux term (stellar units).
 * - fluxForwardScattering: additive forward-scattering term (stellar units).
 * - fluxRingScattering: additive ring-scattering term (stellar units).
 *
 * Recommended invariant (Physical Model):
 *   fluxTotal =
 *     fluxStellarPreTransit * fluxTransitFactor +
 *     fluxPlanetPhase + fluxMoonPhase +
 *     fluxForwardScattering + fluxRingScattering + fluxRefraction
 *
 * Precision Note:
 * Due to IEEE 754 floating-point arithmetic, this equality holds only within a small numerical tolerance
 * (typically epsilon ≈ 1e-15 for double precision, or conservatively 1e-10).
 * Unit tests checking this invariant should use `Math.abs(lhs - rhs) < epsilon`.
 */
export type StepResult = {
  fluxTotal: number;

  planetSky: SkyPoint;
  moonSky?: SkyPoint;

  fluxTransitFactor?: number;

  /** baselineFlux + fluxStellarVar (stellar units). */
  fluxStellarPreTransit?: number;

  /** Additive stellar variability component only (stellar units). */
  fluxStellarVar?: number;

  /** Additive planet phase/self-flux component (stellar units). */
  fluxPlanetPhase?: number;

  /** Additive moon phase/self-flux component (stellar units). */
  fluxMoonPhase?: number;

  /** Additive forward-scattering component (stellar units). */
  fluxForwardScattering?: number;

  /** Additive ring-scattering component (stellar units). */
  fluxRingScattering?: number;

  /** Additive atmospheric-refraction shoulder component (stellar units). */
  fluxRefraction?: number;

  /** Optional convenience diagnostic values. */
  meta?: StepMeta;
};
