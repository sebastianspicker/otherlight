/** Applies mutual and stellar occultation policies to additive body flux. */
import type { CircleOcculter } from "../photometry/occulterCircle";
import { visibleFractionWhenOcculted } from "../photometry/mutualEvents";
import {
  addOcculterIfFront,
  effectiveProjectedRadius,
  visibleFractionWithOcculters,
} from "./additiveFluxOccultationGeometry";
import { isPhysicsFeatureEnabled } from "./fidelity";
import type { AdditiveFluxContext, FluxPair, SkyPosition, VisibleFractions } from "./additiveFluxTypes";

export function computeMutualVisibleFractions(
  context: AdditiveFluxContext,
  flux: FluxPair,
): VisibleFractions {
  const { params, kin } = context;
  if (!params.moon || !kin.moonSky) return {};
  return {
    planetVisibleFraction: diagnosticVisibleFraction({
      activeFlux: flux.fluxPlanetOnly,
      targetSky: kin.planetSky,
      occulterSky: kin.moonSky,
      rTarget: params.planet.r,
      rOcculter: params.moon.r,
    }),
    moonVisibleFraction: diagnosticVisibleFraction({
      activeFlux: flux.fluxMoonOnly,
      targetSky: kin.moonSky,
      occulterSky: kin.planetSky,
      rTarget: params.moon.r,
      rOcculter: params.planet.r,
    }),
  };
}

function diagnosticVisibleFraction(args: {
  activeFlux: number;
  targetSky: SkyPosition;
  occulterSky: SkyPosition;
  rTarget: number;
  rOcculter: number;
}): number | undefined {
  if (args.activeFlux === 0 || !(args.occulterSky.z > args.targetSky.z)) return undefined;
  const visible = visibleFractionWhenOcculted(args);
  return Number.isFinite(visible) ? visible : undefined;
}

export function applyBodyOccultationTerms(context: AdditiveFluxContext, flux: FluxPair): FluxPair {
  return {
    fluxPlanetOnly: applyPlanetOccultation(context, flux.fluxPlanetOnly),
    fluxMoonOnly: applyMoonOccultation(context, flux.fluxMoonOnly),
  };
}

function applyPlanetOccultation(context: AdditiveFluxContext, flux: number): number {
  if (flux === 0) return flux;
  const { params, kin, starRadius } = context;
  const occulters: CircleOcculter[] = [];
  addOcculterIfFront(occulters, kin.planetSky, { x: 0, y: 0, z: 0 }, starRadius);
  if (params.moon && kin.moonSky) {
    addOcculterIfFront(occulters, kin.planetSky, kin.moonSky, projectedBodyRadius(context, params.moon));
  }
  return fluxWithVisibleFraction(flux, projectedBodyRadius(context, params.planet), occulters);
}

function applyMoonOccultation(context: AdditiveFluxContext, flux: number): number {
  const { params, kin, starRadius } = context;
  if (flux === 0 || !params.moon || !kin.moonSky) return flux;
  const occulters: CircleOcculter[] = [];
  addOcculterIfFront(occulters, kin.moonSky, { x: 0, y: 0, z: 0 }, starRadius);
  addOcculterIfFront(occulters, kin.moonSky, kin.planetSky, projectedBodyRadius(context, params.planet));
  return fluxWithVisibleFraction(flux, projectedBodyRadius(context, params.moon), occulters);
}

function projectedBodyRadius(
  context: AdditiveFluxContext,
  body: { r: number; shape?: { oblateness?: number }; rings?: { outerRadius: number } },
): number {
  return isPhysicsFeatureEnabled(context.params, "nonSphericalFlux")
    ? effectiveProjectedRadius(body)
    : body.r;
}

function fluxWithVisibleFraction(flux: number, radius: number, occulters: CircleOcculter[]): number {
  const visible = visibleFractionWithOcculters(radius, occulters);
  return Number.isFinite(visible) ? flux * visible : flux;
}
