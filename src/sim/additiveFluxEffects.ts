/** Computes stellar, scattering, ring, and refraction additive-flux effects. */
import { clamp, toFiniteNumber } from "../core/units";
import { transitCenteredPhaseRadFromBodyPos } from "../photometry/dayNightVisibility";
import { computeForwardScatteringFlux } from "../photometry/forwardScattering";
import { stellarVariabilityFlux } from "../photometry/stellarVariability";
import { hasActiveReflectedPhaseChannel } from "./additiveFluxContext";
import { buildRefractionContext, refractionFluxForBody } from "./additiveFluxRefraction";
import type { AdditiveFluxComponents, AdditiveFluxContext } from "./additiveFluxTypes";
import { isPhysicsFeatureEnabled } from "./fidelity";

export function computeStellarVariabilityTerm(context: AdditiveFluxContext): number {
  return stellarVariabilityFlux({
    t: context.t,
    orbit: context.orbit,
    model: context.phot?.stellarVariability,
  });
}

export function computeForwardScatteringTerm(context: AdditiveFluxContext): number {
  const phase = transitCenteredPhaseRadFromBodyPos(context.kin.rPlanetAbs, context.observerDir);
  const model =
    context.scientificEnergyComposition && hasActiveReflectedPhaseChannel(context.phot?.phaseCurve)
      ? { ...context.phot?.forwardScattering, enabled: false }
      : context.phot?.forwardScattering;
  return computeForwardScatteringFlux({
    rBody: context.kin.rPlanetAbs,
    observerDir: context.observerDir,
    model,
    phase: Number.isFinite(phase) ? phase : undefined,
  });
}

export function computeRingScatteringTerm(context: AdditiveFluxContext): number {
  if (!isPhysicsFeatureEnabled(context.params, "nonSphericalFlux")) return 0;
  const rings = context.params.planet.rings;
  if (!rings) return 0;
  if (context.scientificEnergyComposition && hasActiveReflectedPhaseChannel(context.phot?.phaseCurve)) {
    return 0;
  }
  const ring = context.phot?.ringScattering;
  if (!ring?.enabled) return 0;
  const amp = Number.isFinite(ring.amp) ? Math.max(0, ring.amp as number) : 0;
  if (amp <= 0) return 0;
  const sigma = Number.isFinite(ring.sigmaPhase) ? Math.max(1e-4, ring.sigmaPhase as number) : 0.25;
  const phase = transitCenteredPhaseRadFromBodyPos(context.kin.rPlanetAbs, context.observerDir);
  const wrapped = Number.isFinite(phase) ? Math.atan2(Math.sin(phase), Math.cos(phase)) : 0;
  const phaseWeight = Number.isFinite(phase) ? Math.exp(-(wrapped * wrapped) / (2 * sigma * sigma)) : 0;
  const inclination = Number.isFinite(rings.inclination) ? (rings.inclination as number) : 0;
  return amp * phaseWeight * clamp(Math.abs(Math.cos(inclination)), 0.1, 1);
}

export function computeRefractionTerm(context: AdditiveFluxContext): number {
  const refractionContext = buildRefractionContext(context);
  if (!refractionContext) return 0;
  let flux = refractionFluxForBody(refractionContext, context.params.planet, context.kin.planetSky, "planet");
  if (context.params.moon && context.kin.moonSky) {
    flux += refractionFluxForBody(refractionContext, context.params.moon, context.kin.moonSky, "moon");
  }
  return flux;
}

export function finalizeAdditiveFluxComponents(components: AdditiveFluxComponents): AdditiveFluxComponents {
  return {
    fluxPlanetOnly: toFiniteNumber(components.fluxPlanetOnly, 0),
    fluxMoonOnly: toFiniteNumber(components.fluxMoonOnly, 0),
    fluxStellarVarOnly: toFiniteNumber(components.fluxStellarVarOnly, 0),
    fluxForwardScatteringOnly: toFiniteNumber(components.fluxForwardScatteringOnly, 0),
    fluxRingScatteringOnly: toFiniteNumber(components.fluxRingScatteringOnly, 0),
    fluxRefractionOnly: toFiniteNumber(components.fluxRefractionOnly, 0),
    planetVisibleFraction: components.planetVisibleFraction,
    moonVisibleFraction: components.moonVisibleFraction,
  };
}
