// src/sim/additiveFlux.ts

import type {
  AtmosphereRTParams,
  PhaseCurveParams,
  SystemParams,
  ThermalModelAdvancedParams,
} from "../core/types";
import { clamp, toFiniteNumber } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { bodyPhaseFlux } from "../photometry/phaseCurve";
import { stellarVariabilityFlux } from "../photometry/stellarVariability";
import { computeForwardScatteringFlux } from "../photometry/forwardScattering";
import { visibleFractionWhenOcculted } from "../photometry/mutualEvents";
import {
  phaseAngleRadFromBodyPos,
  transitCenteredPhaseRadFromBodyPos,
} from "../photometry/dayNightVisibility";
import { fluxUniformDisk } from "../photometry/transitUniform";
import type { CircleOcculter } from "../photometry/occulterCircle";
import type { BodyKinematics } from "./kinematics";
import { resolveOrbitElements } from "./orbits";
import { isPhysicsFeatureEnabled } from "./fidelity";

const MUTUAL_OCCULTER_GRID_RES = 120;

type SkyPosition = { x: number; y: number; z: number };
type BandWeight = { lambdaNm: number; w: number };
type FluxPair = {
  fluxPlanetOnly: number;
  fluxMoonOnly: number;
};
type AdditiveFluxContext = {
  params: SystemParams;
  t: number;
  observerDir: Vec3;
  kin: BodyKinematics;
  phot: SystemParams["star"]["photometry"];
  starRadius: number;
  bands: BandWeight[];
  orbit: ReturnType<typeof resolveOrbitElements>;
  thermalModelAdvanced: ThermalModelAdvancedParams | undefined;
  scientificEnergyComposition: boolean;
  rt: AtmosphereRTParams | undefined;
};
type RefractionContext = {
  rt: AtmosphereRTParams;
  refraction: NonNullable<AtmosphereRTParams["refraction"]>;
  bands: BandWeight[];
  starRadius: number;
  amp: number;
  lambdaRef: number;
  chromaticSlope: number;
};
type VisibleFractions = Pick<AdditiveFluxComponents, "planetVisibleFraction" | "moonVisibleFraction">;
type RtEmissionContext = {
  amp: number;
  lag: number;
  target: "planet" | "moon";
};
type RingScatteringContext = {
  amp: number;
  sigma: number;
  inclination: number | undefined;
};

function addOcculterIfFront(
  occulters: CircleOcculter[],
  targetSky: SkyPosition,
  occulterSky: SkyPosition,
  rOcculter: number,
): void {
  const occulter = frontOcculterForTarget(targetSky, occulterSky, rOcculter);
  if (!occulter) return;
  occulters.push(occulter);
}

const frontOcculterForTarget = (
  targetSky: SkyPosition,
  occulterSky: SkyPosition,
  rOcculter: number,
): CircleOcculter | undefined => {
  if (!isPositiveFinite(rOcculter)) return undefined;
  if (!isFiniteSkyPosition(targetSky) || !isFiniteSkyPosition(occulterSky)) return undefined;
  if (!(occulterSky.z > targetSky.z)) return undefined;

  return {
    dx: occulterSky.x - targetSky.x,
    dy: occulterSky.y - targetSky.y,
    r: rOcculter,
  };
};

const isPositiveFinite = (value: number | undefined): value is number => {
  return Number.isFinite(value) && (value as number) > 0;
};

const isFiniteSkyPosition = (sky: SkyPosition | undefined): sky is SkyPosition => {
  return Boolean(sky && Number.isFinite(sky.x) && Number.isFinite(sky.y) && Number.isFinite(sky.z));
};

const visibleFractionWithOcculters = (rTarget: number, occulters: CircleOcculter[]): number => {
  if (!Number.isFinite(rTarget) || rTarget <= 0) return 1;
  if (occulters.length === 0) return 1;

  try {
    return fluxUniformDisk({
      rStar: rTarget,
      rOcculters: occulters,
      gridRes: MUTUAL_OCCULTER_GRID_RES,
    });
  } catch {
    // Fail-open: grid-based occlusion computation failed; assume full visibility (flux = 1).
    return 1;
  }
};

const effectiveProjectedRadius = (body: {
  r: number;
  shape?: { oblateness?: number };
  rings?: { outerRadius: number };
}): number => {
  const rBody = Number.isFinite(body.r) && body.r > 0 ? body.r : 0;
  const f = Number.isFinite(body.shape?.oblateness)
    ? Math.max(0, Math.min(0.95, body.shape!.oblateness as number))
    : 0;
  const oblateEquiv = rBody * (1 - 0.5 * f);
  const ringOuter = Number.isFinite(body.rings?.outerRadius)
    ? Math.max(0, body.rings!.outerRadius as number)
    : 0;
  return Math.max(oblateEquiv, ringOuter, rBody);
};

export type AdditiveFluxComponents = {
  fluxPlanetOnly: number;
  fluxMoonOnly: number;
  fluxStellarVarOnly: number;
  fluxForwardScatteringOnly: number;
  fluxRingScatteringOnly: number;
  fluxRefractionOnly: number;
  planetVisibleFraction?: number;
  moonVisibleFraction?: number;
};

function normalizedBandWeights(phot: SystemParams["star"]["photometry"]): BandWeight[] {
  const bp = phot?.spectralBandpass;
  if (!bp?.enabled || !Array.isArray(bp.lambdaNm) || bp.lambdaNm.length === 0) {
    return defaultBandWeights();
  }

  const entries = positiveBandpassEntries(bp.lambdaNm);
  if (entries.lambda.length === 0) return defaultBandWeights();

  const raw = selectedBandpassWeights(bp.weights, bp.lambdaNm.length, entries);
  const norm = normalizedPositiveWeights(raw, entries.lambda.length);
  return entries.lambda.map((lambdaNm, i) => ({ lambdaNm, w: norm[i] }));
}

const defaultBandWeights = (): BandWeight[] => {
  return [{ lambdaNm: 550, w: 1 }];
};

const positiveBandpassEntries = (lambdaNm: number[]): { keepIdx: number[]; lambda: number[] } => {
  const keepIdx: number[] = [];
  const lambda: number[] = [];

  for (let index = 0; index < lambdaNm.length; index++) {
    const value = lambdaNm[index];
    if (!isPositiveFinite(value)) continue;
    keepIdx.push(index);
    lambda.push(value);
  }

  return { keepIdx, lambda };
};

const selectedBandpassWeights = (
  weights: number[] | undefined,
  sourceLength: number,
  entries: { keepIdx: number[]; lambda: number[] },
): number[] => {
  const rawWeights = Array.isArray(weights) ? weights : [];
  if (rawWeights.length === sourceLength) return entries.keepIdx.map((index) => rawWeights[index]);
  if (rawWeights.length === entries.lambda.length) return rawWeights;
  return entries.lambda.map(() => 1);
};

const normalizedPositiveWeights = (raw: number[], count: number): number[] => {
  const clipped = raw.map((x) => (isPositiveFinite(x) ? x : 0));
  const sum = clipped.reduce((a, b) => a + b, 0);
  return sum > 0 ? clipped.map((x) => x / sum) : equalWeights(count);
};

const equalWeights = (count: number): number[] => {
  return Array.from({ length: count }, () => 1 / count);
};

const bandScatteringBoost = (lambdaNm: number, rt: AtmosphereRTParams | undefined): number => {
  if (!rt?.scattering?.enabled) return 1;
  const gain = Number.isFinite(rt.scattering.gain) ? Math.max(0, rt.scattering.gain as number) : 0;
  const g = Number.isFinite(rt.scattering.g) ? Math.max(-0.95, Math.min(0.95, rt.scattering.g as number)) : 0;
  const lambdaRef = Number.isFinite(rt.lambdaRefNm) ? Math.max(1, rt.lambdaRefNm as number) : 550;
  const wl = Number.isFinite(lambdaNm) ? Math.max(1, lambdaNm) : lambdaRef;
  const wlScale = Math.pow(wl / lambdaRef, -(0.3 + 0.4 * Math.max(0, g)));
  return 1 + gain * wlScale;
};

const gaussianPhaseWeight = (phase: number, sigma: number): number => {
  const d = Math.atan2(Math.sin(phase), Math.cos(phase));
  const s = Math.max(1e-6, sigma);
  return Math.exp(-(d * d) / (2 * s * s));
};

const gaussianDistanceWeight = (distance: number, sigma: number): number => {
  const s = Math.max(1e-9, sigma);
  return Math.exp(-(distance * distance) / (2 * s * s));
};

const hasActiveThermalPhaseChannel = (args: {
  model: PhaseCurveParams | undefined;
  thermalModelAdvanced: ThermalModelAdvancedParams | undefined;
  system: SystemParams;
}): boolean => {
  if (!args.model?.enabled) return false;
  if (Number.isFinite(args.model.thermAmp) && (args.model.thermAmp as number) > 0) return true;
  if (Number.isFinite(args.model.constant) && (args.model.constant as number) > 0) return true;
  if (isPhysicsFeatureEnabled(args.system, "thermalEnergyBalance") && args.thermalModelAdvanced?.enabled) {
    return true;
  }
  return false;
};

const hasActiveReflectedPhaseChannel = (model: PhaseCurveParams | undefined): boolean => {
  if (!model?.enabled) return false;
  return Number.isFinite(model.reflAmp) && (model.reflAmp as number) > 0;
};

export function computeAdditiveFluxComponents(
  params: SystemParams,
  t: number,
  observerDir: Vec3,
  kin: BodyKinematics,
): AdditiveFluxComponents {
  const context = additiveFluxContext(params, t, observerDir, kin);
  const emittedFlux = applyRtEmissionTerms(context, computePhaseFluxTerms(context));
  const visibleFractions = computeMutualVisibleFractions(context, emittedFlux);
  const occultedFlux = applyBodyOccultationTerms(context, emittedFlux);

  return finalizeAdditiveFluxComponents({
    ...occultedFlux,
    fluxStellarVarOnly: computeStellarVariabilityTerm(context),
    fluxForwardScatteringOnly: computeForwardScatteringTerm(context),
    fluxRingScatteringOnly: computeRingScatteringTerm(context),
    fluxRefractionOnly: computeRefractionTerm(context),
    ...visibleFractions,
  });
}

function additiveFluxContext(
  params: SystemParams,
  t: number,
  observerDir: Vec3,
  kin: BodyKinematics,
): AdditiveFluxContext {
  const phot = params.star.photometry;
  return {
    params,
    t,
    observerDir,
    kin,
    phot,
    starRadius: params.star.r,
    bands: normalizedBandWeights(phot),
    orbit: kin.planetOrbit ?? resolveOrbitElements(params.planet.orbit, t, "planet.orbit"),
    thermalModelAdvanced: isPhysicsFeatureEnabled(params, "thermalEnergyBalance")
      ? phot?.thermalModelAdvanced
      : undefined,
    scientificEnergyComposition:
      params.dynamics?.fidelityProfile === "accurate" || params.dynamics?.fidelityProfile === "reference",
    rt: isPhysicsFeatureEnabled(params, "atmosphereRT") ? phot?.atmosphereRT : undefined,
  };
}

function computePhaseFluxTerms(context: AdditiveFluxContext): FluxPair {
  return {
    fluxPlanetOnly: weightedBodyPhaseFlux(context, {
      rBody: context.kin.rPlanetAbs,
      rBodyRadius: context.params.planet.r,
      orbitPeriodSec: context.orbit.period,
      model: context.phot?.phaseCurve,
    }),
    fluxMoonOnly: computeMoonPhaseFlux(context),
  };
}

function computeMoonPhaseFlux(context: AdditiveFluxContext): number {
  const { params, t, kin } = context;
  if (!params.moon || !kin.rMoonAbs) return 0;

  const moonOrbitEl = resolveOrbitElements(params.moon.orbitAroundPlanet, t, "moon.orbitAroundPlanet");
  return weightedBodyPhaseFlux(context, {
    rBody: kin.rMoonAbs,
    rBodyRadius: params.moon.r,
    orbitPeriodSec: moonOrbitEl.period,
    model: context.phot?.moonPhaseCurve,
  });
}

const weightedBodyPhaseFlux = (
  context: AdditiveFluxContext,
  body: {
    rBody: Vec3;
    rBodyRadius: number;
    orbitPeriodSec: number;
    model: PhaseCurveParams | undefined;
  },
): number => {
  let flux = 0;
  for (const band of context.bands) {
    const base = bodyPhaseFlux({
      rBody: body.rBody,
      rBodyRadius: body.rBodyRadius,
      rStarRadius: context.starRadius,
      observerDir: context.observerDir,
      orbitPeriodSec: body.orbitPeriodSec,
      model: body.model,
      dayNightVisibility: context.phot?.dayNightVisibility,
      thermalModelAdvanced: context.thermalModelAdvanced,
    });
    flux += band.w * base * bandScatteringBoost(band.lambdaNm, context.phot?.atmosphereRT);
  }
  return flux;
};

const applyRtEmissionTerms = (context: AdditiveFluxContext, flux: FluxPair): FluxPair => {
  const emission = activeRtEmissionContext(context);
  if (!emission) return flux;
  if (emission.target === "planet") return applyPlanetEmission(context, flux, emission.amp, emission.lag);
  return applyMoonEmission(context, flux, emission.amp, emission.lag);
};

const activeRtEmissionContext = (context: AdditiveFluxContext): RtEmissionContext | undefined => {
  const rt = context.rt;
  const emission = rt?.emission;
  if (!rt?.enabled || !emission?.enabled) return undefined;

  const amp = Number.isFinite(emission.amp) ? Math.max(0, emission.amp as number) : 0;
  if (amp <= 0) return undefined;

  return {
    amp,
    lag: Number.isFinite(emission.phaseLag) ? (emission.phaseLag as number) : 0,
    target: (rt.target ?? "planet") === "moon" ? "moon" : "planet",
  };
};

const applyPlanetEmission = (
  context: AdditiveFluxContext,
  flux: FluxPair,
  amp: number,
  lag: number,
): FluxPair => {
  if (suppressesThermalEmission(context, context.phot?.phaseCurve)) return flux;
  return {
    ...flux,
    fluxPlanetOnly: flux.fluxPlanetOnly + emissionFlux(context.kin.rPlanetAbs, context.observerDir, amp, lag),
  };
};

function applyMoonEmission(context: AdditiveFluxContext, flux: FluxPair, amp: number, lag: number): FluxPair {
  if (!context.params.moon || !context.kin.rMoonAbs) return flux;
  if (suppressesThermalEmission(context, context.phot?.moonPhaseCurve)) return flux;
  return {
    ...flux,
    fluxMoonOnly: flux.fluxMoonOnly + emissionFlux(context.kin.rMoonAbs, context.observerDir, amp, lag),
  };
}

function suppressesThermalEmission(
  context: AdditiveFluxContext,
  model: PhaseCurveParams | undefined,
): boolean {
  return (
    context.scientificEnergyComposition &&
    hasActiveThermalPhaseChannel({
      model,
      thermalModelAdvanced: context.thermalModelAdvanced,
      system: context.params,
    })
  );
}

function emissionFlux(rBody: Vec3, observerDir: Vec3, amp: number, lag: number): number {
  const alpha = phaseAngleRadFromBodyPos(rBody, observerDir);
  if (!Number.isFinite(alpha)) return 0;
  const weight = Math.max(0, 0.5 * (1 + Math.cos(alpha - lag)));
  return amp * weight;
}

// Diagnostic visible fractions intentionally use pairwise circle occultation; flux
// attenuation below uses the simultaneous union of star and mutual occulters.
function computeMutualVisibleFractions(context: AdditiveFluxContext, flux: FluxPair): VisibleFractions {
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

function applyBodyOccultationTerms(context: AdditiveFluxContext, flux: FluxPair): FluxPair {
  return {
    fluxPlanetOnly: applyPlanetOccultation(context, flux.fluxPlanetOnly),
    fluxMoonOnly: applyMoonOccultation(context, flux.fluxMoonOnly),
  };
}

function applyPlanetOccultation(context: AdditiveFluxContext, fluxPlanetOnly: number): number {
  if (fluxPlanetOnly === 0) return fluxPlanetOnly;

  const { params, kin, starRadius } = context;
  const occulters: CircleOcculter[] = [];
  addOcculterIfFront(occulters, kin.planetSky, { x: 0, y: 0, z: 0 }, starRadius);
  if (params.moon && kin.moonSky) {
    addOcculterIfFront(occulters, kin.planetSky, kin.moonSky, projectedBodyRadius(context, params.moon));
  }

  return fluxWithVisibleFraction(fluxPlanetOnly, projectedBodyRadius(context, params.planet), occulters);
}

function applyMoonOccultation(context: AdditiveFluxContext, fluxMoonOnly: number): number {
  const { params, kin, starRadius } = context;
  if (fluxMoonOnly === 0 || !params.moon || !kin.moonSky) return fluxMoonOnly;

  const occulters: CircleOcculter[] = [];
  addOcculterIfFront(occulters, kin.moonSky, { x: 0, y: 0, z: 0 }, starRadius);
  addOcculterIfFront(occulters, kin.moonSky, kin.planetSky, projectedBodyRadius(context, params.planet));
  return fluxWithVisibleFraction(fluxMoonOnly, projectedBodyRadius(context, params.moon), occulters);
}

function projectedBodyRadius(
  context: AdditiveFluxContext,
  body: { r: number; shape?: { oblateness?: number }; rings?: { outerRadius: number } },
): number {
  return isPhysicsFeatureEnabled(context.params, "nonSphericalFlux")
    ? effectiveProjectedRadius(body)
    : body.r;
}

function fluxWithVisibleFraction(flux: number, targetRadius: number, occulters: CircleOcculter[]): number {
  const visible = visibleFractionWithOcculters(targetRadius, occulters);
  return Number.isFinite(visible) ? flux * visible : flux;
}

function computeStellarVariabilityTerm(context: AdditiveFluxContext): number {
  return stellarVariabilityFlux({
    t: context.t,
    orbit: context.orbit,
    model: context.phot?.stellarVariability,
  });
}

function computeForwardScatteringTerm(context: AdditiveFluxContext): number {
  const phase = transitCenteredPhaseRadFromBodyPos(context.kin.rPlanetAbs, context.observerDir);
  return computeForwardScatteringFlux({
    rBody: context.kin.rPlanetAbs,
    observerDir: context.observerDir,
    model: forwardScatteringModel(context),
    phase: Number.isFinite(phase) ? phase : undefined,
  });
}

function forwardScatteringModel(context: AdditiveFluxContext) {
  if (context.scientificEnergyComposition && hasActiveReflectedPhaseChannel(context.phot?.phaseCurve)) {
    return { ...context.phot?.forwardScattering, enabled: false };
  }
  return context.phot?.forwardScattering;
}

function computeRingScatteringTerm(context: AdditiveFluxContext): number {
  const ring = activeRingScatteringContext(context);
  if (!ring) return 0;

  const phase = transitCenteredPhaseRadFromBodyPos(context.kin.rPlanetAbs, context.observerDir);
  const phaseWeight = Number.isFinite(phase) ? gaussianPhaseWeight(phase, ring.sigma) : 0;
  return ring.amp * phaseWeight * ringTiltWeight(ring.inclination);
}

function activeRingScatteringContext(context: AdditiveFluxContext): RingScatteringContext | undefined {
  const ringSc = enabledRingScatteringConfig(context);
  if (!ringSc) return undefined;
  const rings = context.params.planet.rings;
  if (!rings) return undefined;

  const amp = positiveRingScatteringAmp(ringSc.amp);
  if (amp === undefined) return undefined;

  return {
    amp,
    sigma: ringScatteringSigma(ringSc.sigmaPhase),
    inclination: rings.inclination,
  };
}

function enabledRingScatteringConfig(context: AdditiveFluxContext) {
  if (!isPhysicsFeatureEnabled(context.params, "nonSphericalFlux")) return undefined;
  if (!context.params.planet.rings) return undefined;
  if (context.scientificEnergyComposition && hasActiveReflectedPhaseChannel(context.phot?.phaseCurve)) {
    return undefined;
  }
  return context.phot?.ringScattering?.enabled ? context.phot.ringScattering : undefined;
}

function positiveRingScatteringAmp(amp: number | undefined): number | undefined {
  const value = Number.isFinite(amp) ? Math.max(0, amp as number) : 0;
  return value > 0 ? value : undefined;
}

function ringScatteringSigma(sigmaPhase: number | undefined): number {
  return Number.isFinite(sigmaPhase) ? Math.max(1e-4, sigmaPhase as number) : 0.25;
}

function ringTiltWeight(inclination: number | undefined): number {
  const inc = Number.isFinite(inclination) ? (inclination as number) : 0;
  return clamp(Math.abs(Math.cos(inc)), 0.1, 1);
}

function computeRefractionTerm(context: AdditiveFluxContext): number {
  const refractionContext = buildRefractionContext(context);
  if (!refractionContext) return 0;

  let flux = refractionForBody(refractionContext, context.params.planet, context.kin.planetSky, "planet");
  if (context.params.moon && context.kin.moonSky) {
    flux += refractionForBody(refractionContext, context.params.moon, context.kin.moonSky, "moon");
  }
  return flux;
}

function buildRefractionContext(context: AdditiveFluxContext): RefractionContext | undefined {
  const rt = context.rt;
  const refraction = rt?.refraction;
  if (!rt?.enabled || !refraction?.enabled) return undefined;

  return {
    rt,
    refraction,
    bands: context.bands,
    starRadius: context.starRadius,
    amp: Number.isFinite(refraction.amp) ? Math.max(0, refraction.amp as number) : 0,
    lambdaRef: Number.isFinite(rt.lambdaRefNm) ? Math.max(1, rt.lambdaRefNm as number) : 550,
    chromaticSlope: Number.isFinite(refraction.chromaticSlope) ? (refraction.chromaticSlope as number) : 0,
  };
}

function refractionForBody(
  context: RefractionContext,
  body: { r: number },
  sky: SkyPosition | undefined,
  target: "planet" | "moon",
): number {
  if (!canApplyRefraction(context, sky, target)) return 0;

  const contactRadius = context.starRadius + body.r;
  const impactDistance = Math.hypot(sky.x, sky.y);
  const weight = gaussianDistanceWeight(impactDistance - contactRadius, refractionSigma(context, body));
  return context.amp * weight * refractionBandWeight(context);
}

function canApplyRefraction(
  context: RefractionContext,
  sky: SkyPosition | undefined,
  target: "planet" | "moon",
): sky is SkyPosition {
  return Boolean(sky && sky.z > 0 && (context.rt.target ?? "planet") === target && context.amp > 0);
}

function refractionSigma(context: RefractionContext, body: { r: number }): number {
  const width = context.refraction.width;
  return Number.isFinite(width) && (width as number) > 0
    ? (width as number)
    : Math.max(body.r * 0.8, context.starRadius * 0.04);
}

function refractionBandWeight(context: RefractionContext): number {
  let bandWeighted = 0;
  for (const band of context.bands) {
    const wlScale = Math.pow(Math.max(1, band.lambdaNm) / context.lambdaRef, -context.chromaticSlope);
    bandWeighted += band.w * wlScale;
  }
  return bandWeighted;
}

function finalizeAdditiveFluxComponents(components: AdditiveFluxComponents): AdditiveFluxComponents {
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
