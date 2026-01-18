// src/core/typesResults.ts

//
// Types for simulation outputs (one step).
//

import type { SkyPoint } from "./typesObserver";

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

  /** Baseline flux used (defaults to 1.0 when photometry.baselineFlux is absent). */
  baselineFluxUsed?: number;

  /** Planet sky-plane speed diagnostic (units/s). */
  vPlanetSky?: number;

  /** Reference planet sky-plane speed diagnostic (units/s). */
  vPlanetSkyRef?: number;

  /** TDV-like ratio diagnostic (dimensionless). */
  tdvRatio?: number;

  /** Impact parameter proxy b ≈ |y|/R*. */
  bPlanet?: number;

  /** Impact parameter proxy b ≈ |y|/R*. */
  bMoon?: number;
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
 *
 * Recommended invariant (Physical Model):
 *   fluxTotal = fluxStellarPreTransit * fluxTransitFactor + (fluxPlanetPhase + fluxMoonPhase + fluxForwardScattering)
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

  /** Optional convenience diagnostic values. */
  meta?: StepMeta;
};
