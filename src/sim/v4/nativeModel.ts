import { clamp01 } from "../../core/units";
import type { PhaseCurveParams } from "../../core/types";
import { computeForwardScatteringFlux } from "../../photometry/forwardScattering";
import { transitCenteredPhaseRadFromBodyPos } from "../../photometry/dayNightVisibility";
import { bodyPhaseFlux } from "../../photometry/phaseCurve";
import { stellarVariabilityFlux } from "../../photometry/stellarVariability";
import { vSub } from "../../physics/vec3";
import {
  atmosphereOpacityForOcculter,
  circleOverlapArea,
  gaussianPhaseWeight,
  starVisibilityFromOcculters,
  resolveWeightedPhotometryBands,
  starVisibilityFromOpaqueOcculters,
} from "./nativePhotometry";
import type { MoonBodyV4, PlanetBodyV4, SimulationConfigV4 } from "./types";
import type { NativeBodyState, NativeSnapshot } from "./nativeSnapshot";

export { finiteOrDefault } from "./nativeSnapshotHelpers";
export { buildNativeSnapshot, orbitStateAt } from "./nativeSnapshot";
export type { ConservationBaseline, NativeBodyState, NativeSnapshot } from "./nativeSnapshot";

export type FluxBundle = {
  stellarA: number;
  stellarB: number;
  stellarPreTransit: number;
  binaryEclipseFactor: number;
  transitFactor: number;
  additivePlanetary: number;
  additiveLunar: number;
  forwardScattering: number;
  ringScattering: number;
  refraction: number;
  stellarVariability: number;
  total: number;
  nOcculters: number;
  planetVisibleFraction?: number;
  moonVisibleFraction?: number;
};

type VisibilityBundle = {
  byStar: Map<string, number>;
  byStarBinary: Map<string, number>;
  nOcculters: number;
};

type StellarComponents = {
  stellarA: number;
  stellarB: number;
  stellarPreTransit: number;
  binaryEclipseFactor: number;
  stellarVariability: number;
};

type ScatteringComponents = {
  forwardScattering: number;
  ringScattering: number;
};

type VisibleFractions = {
  planetVisibleFraction?: number;
  moonVisibleFraction?: number;
};

type AtmosphereRTConfig = NonNullable<NonNullable<SimulationConfigV4["photometry"]>["atmosphereRT"]>;
type StellarSurfaceConfig = NonNullable<NonNullable<SimulationConfigV4["photometry"]>["stellarSurface"]>;
type WeightedPhotometryBands = ReturnType<typeof resolveWeightedPhotometryBands>;

function activeLuminousStars(snap: NativeSnapshot): NativeBodyState[] {
  return snap.stars.filter((s) => s.active && s.luminosity > 0 && s.r > 0);
}

function activeNonStarOcculters(snap: NativeSnapshot): NativeBodyState[] {
  return snap.bodies.filter((b) => b.kind !== "star" && b.active && b.r > 0);
}

function frontStarsForStar(stars: NativeBodyState[], star: NativeBodyState): NativeBodyState[] {
  return stars.filter((other) => other.id !== star.id && other.sky.z > star.sky.z);
}

function weightedFrontOcculters(
  config: SimulationConfigV4,
  star: NativeBodyState,
  occulters: NativeBodyState[],
): NativeBodyState[] {
  return occulters
    .filter((oc) => oc.sky.z > star.sky.z)
    .map((oc) => ({
      ...oc,
      opacity: oc.kind === "star" ? 1 : atmosphereOpacityForOcculter(config, oc),
    }));
}

function primaryNonStarOcculterCount(
  snap: NativeSnapshot,
  star: NativeBodyState,
  occulters: NativeBodyState[],
): number {
  if (star.id !== snap.stars[0]?.id) return 0;
  return occulters.filter((oc) => oc.kind !== "star" && oc.sky.z > star.sky.z).length;
}

function visibilityForStar(
  config: SimulationConfigV4,
  snap: NativeSnapshot,
  star: NativeBodyState,
  frontStars: NativeBodyState[],
  nonStars: NativeBodyState[],
): { visible: number; binaryVisible: number; nOcculters: number } {
  if (config.mode === "detached-binary-lab" && nonStars.length === 0) {
    const binaryVisible = starVisibilityFromOpaqueOcculters(config, star, frontStars);
    return { visible: binaryVisible, binaryVisible, nOcculters: 0 };
  }

  const occulters = [...nonStars, ...frontStars];
  return {
    visible: starVisibilityFromOcculters(config, star, weightedFrontOcculters(config, star, occulters)),
    binaryVisible: starVisibilityFromOpaqueOcculters(config, star, frontStars),
    nOcculters: primaryNonStarOcculterCount(snap, star, occulters),
  };
}

function computeVisibilityBundle(
  config: SimulationConfigV4,
  snap: NativeSnapshot,
  luminousStars: NativeBodyState[],
  nonStars: NativeBodyState[],
): VisibilityBundle {
  const byStar = new Map<string, number>();
  const byStarBinary = new Map<string, number>();
  let nOcculters = 0;

  for (const star of luminousStars) {
    const frontStars = frontStarsForStar(luminousStars, star);
    const visibility = visibilityForStar(config, snap, star, frontStars, nonStars);
    byStar.set(star.id, visibility.visible);
    byStarBinary.set(star.id, visibility.binaryVisible);
    nOcculters += visibility.nOcculters;
  }

  return { byStar, byStarBinary, nOcculters };
}

function stellarVariabilityBase(config: SimulationConfigV4, tObsSec: number): number {
  return stellarVariabilityFlux({
    t: tObsSec,
    orbit: config.bodies.planets[0]?.orbit ?? config.orbits.binary,
    model: config.photometry?.stellarVariability,
  });
}

function granulationFlux(surf: StellarSurfaceConfig | undefined, tObsSec: number): number {
  if (!(surf?.enabled && Number.isFinite(surf.granulationSigma))) return 0;
  return (
    (surf.granulationSigma as number) *
    Math.sin((2 * Math.PI * tObsSec) / Math.max(1, surf.granulationTimescaleSec ?? 300))
  );
}

function activityCycleFlux(surf: StellarSurfaceConfig | undefined, tObsSec: number): number {
  if (
    !(surf?.enabled && Number.isFinite(surf.activityCyclePeriodSec) && Number.isFinite(surf.activityCycleAmp))
  ) {
    return 0;
  }
  return (
    (surf.activityCycleAmp as number) *
    Math.sin((2 * Math.PI * tObsSec) / Math.max(1, surf.activityCyclePeriodSec as number))
  );
}

function stellarSurfaceVariability(config: SimulationConfigV4, tObsSec: number): number {
  const surf = config.photometry?.stellarSurface;
  return (
    stellarVariabilityBase(config, tObsSec) +
    granulationFlux(surf, tObsSec) +
    activityCycleFlux(surf, tObsSec)
  );
}

function visibleStellarFlux(snap: NativeSnapshot, visibility: VisibilityBundle, index: number): number {
  const star = snap.stars[index];
  return (star?.luminosity ?? 0) * (visibility.byStar.get(star?.id ?? "") ?? 1);
}

function stellarBaselineFlux(luminousStars: NativeBodyState[]): number {
  return luminousStars.reduce((sum, star) => sum + star.luminosity, 0);
}

function stellarFluxAfterBinaryEclipses(
  luminousStars: NativeBodyState[],
  visibility: VisibilityBundle,
): number {
  return luminousStars.reduce(
    (sum, star) => sum + star.luminosity * (visibility.byStarBinary.get(star.id) ?? 1),
    0,
  );
}

function binaryEclipseFactor(stellarBaseline: number, stellarFromBinaryEclipses: number): number {
  return stellarBaseline > 0 ? clamp01(stellarFromBinaryEclipses / stellarBaseline) : 1;
}

function computeStellarComponents(
  config: SimulationConfigV4,
  snap: NativeSnapshot,
  luminousStars: NativeBodyState[],
  visibility: VisibilityBundle,
  tObsSec: number,
): StellarComponents {
  const stellarBaseline = stellarBaselineFlux(luminousStars);
  const stellarFromBinaryEclipses = stellarFluxAfterBinaryEclipses(luminousStars, visibility);
  const stellarVariability = stellarSurfaceVariability(config, tObsSec);
  const primaryBinaryVis = visibility.byStarBinary.get(snap.stars[0]?.id ?? "") ?? 1;
  return {
    stellarA: visibleStellarFlux(snap, visibility, 0),
    stellarB: visibleStellarFlux(snap, visibility, 1),
    binaryEclipseFactor: binaryEclipseFactor(stellarBaseline, stellarFromBinaryEclipses),
    stellarVariability,
    stellarPreTransit: stellarFromBinaryEclipses + stellarVariability * primaryBinaryVis,
  };
}

function starParentForBody(
  snap: NativeSnapshot,
  body: NativeBodyState,
  fallback: NativeBodyState | undefined,
): NativeBodyState | undefined {
  const parent = body.parentId ? snap.byId.get(body.parentId) : undefined;
  return parent?.kind === "star" ? parent : fallback;
}

function starParentForMoon(
  snap: NativeSnapshot,
  moon: NativeBodyState,
  fallback: NativeBodyState | undefined,
): NativeBodyState | undefined {
  const parentPlanet = moon.parentId ? snap.byId.get(moon.parentId) : undefined;
  const parentStar = parentPlanet?.parentId ? snap.byId.get(parentPlanet.parentId) : undefined;
  return parentStar?.kind === "star" ? parentStar : fallback;
}

function phaseFluxForBody(
  config: SimulationConfigV4,
  snap: NativeSnapshot,
  body: NativeBodyState,
  parentStar: NativeBodyState | undefined,
  orbitPeriodSec: number,
  model: PhaseCurveParams | undefined,
): number {
  const rel = parentStar ? vSub(body.rAbs, parentStar.rAbs) : body.rAbs;
  const phot = config.photometry;
  return bodyPhaseFlux({
    rBody: rel,
    rBodyRadius: body.r,
    rStarRadius: parentStar?.r,
    observerDir: snap.observerDir,
    orbitPeriodSec,
    model,
    dayNightVisibility: phot?.dayNightVisibility,
    thermalModelAdvanced: phot?.thermalModelAdvanced,
  });
}

function computeAdditivePlanetary(config: SimulationConfigV4, snap: NativeSnapshot): number {
  const primaryStar = snap.stars[0];
  return snap.planets.reduce((sum, planet) => {
    const parentStar = starParentForBody(snap, planet, primaryStar);
    return (
      sum +
      phaseFluxForBody(
        config,
        snap,
        planet,
        parentStar,
        (planet.source as PlanetBodyV4).orbit.period,
        config.photometry?.phaseCurve,
      )
    );
  }, 0);
}

function computeAdditiveLunar(config: SimulationConfigV4, snap: NativeSnapshot): number {
  const primaryStar = snap.stars[0];
  return snap.moons.reduce((sum, moon) => {
    const parentStar = starParentForMoon(snap, moon, primaryStar);
    return (
      sum +
      phaseFluxForBody(
        config,
        snap,
        moon,
        parentStar,
        (moon.source as MoonBodyV4).orbit.period,
        config.photometry?.moonPhaseCurve,
      )
    );
  }, 0);
}

function forwardScatteringForPlanet(
  config: SimulationConfigV4,
  snap: NativeSnapshot,
  planet: NativeBodyState,
  parentStar: NativeBodyState | undefined,
  phase: number,
): number {
  const rel = parentStar ? vSub(planet.rAbs, parentStar.rAbs) : planet.rAbs;
  return computeForwardScatteringFlux({
    rBody: rel,
    observerDir: snap.observerDir,
    model: config.photometry?.forwardScattering,
    phase: Number.isFinite(phase) ? phase : undefined,
  });
}

function ringScatteringForPlanet(config: SimulationConfigV4, planet: NativeBodyState, phase: number): number {
  const ringSc = config.photometry?.ringScattering;
  const orbit = planet.source as PlanetBodyV4;
  if (!(ringSc?.enabled && orbit.rings && Number.isFinite(ringSc.amp))) return 0;
  const amp = Math.max(0, ringSc.amp as number);
  if (amp <= 0) return 0;
  const sigma = Number.isFinite(ringSc.sigmaPhase) ? Math.max(1e-4, ringSc.sigmaPhase as number) : 0.25;
  const phaseW = Number.isFinite(phase) ? gaussianPhaseWeight(phase, sigma) : 0;
  const inc = Number.isFinite(orbit.rings.inclination) ? (orbit.rings.inclination as number) : 0;
  const tilt = Math.max(0.1, Math.min(1, Math.abs(Math.cos(inc))));
  return amp * phaseW * tilt;
}

function computeScatteringComponents(config: SimulationConfigV4, snap: NativeSnapshot): ScatteringComponents {
  const firstPlanet = snap.planets[0];
  if (!firstPlanet) return { forwardScattering: 0, ringScattering: 0 };
  const parentStar = starParentForBody(snap, firstPlanet, snap.stars[0]);
  const rel = parentStar ? vSub(firstPlanet.rAbs, parentStar.rAbs) : firstPlanet.rAbs;
  const phase = transitCenteredPhaseRadFromBodyPos(rel, snap.observerDir);
  return {
    forwardScattering: forwardScatteringForPlanet(config, snap, firstPlanet, parentStar, phase),
    ringScattering: ringScatteringForPlanet(config, firstPlanet, phase),
  };
}

function refractionBandWeight(
  bands: WeightedPhotometryBands,
  lambdaRef: number,
  chromaticSlope: number,
): number {
  let bandWeighted = 0;
  for (const band of bands) {
    const wlScale = Math.pow(Math.max(1, band.lambdaNm) / lambdaRef, -chromaticSlope);
    bandWeighted += band.weight * wlScale;
  }
  return bandWeighted;
}

function refractionWidth(rt: AtmosphereRTConfig, body: NativeBodyState, parentStar: NativeBodyState): number {
  return Number.isFinite(rt.refraction?.width) && (rt.refraction?.width as number) > 0
    ? (rt.refraction?.width as number)
    : Math.max(body.r * 0.8, parentStar.r * 0.04);
}

function refractionForBody(args: {
  rt: AtmosphereRTConfig;
  bands: WeightedPhotometryBands;
  lambdaRef: number;
  chromaticSlope: number;
  amp: number;
  body: NativeBodyState | undefined;
  target: "planet" | "moon";
  parentStar: NativeBodyState | undefined;
}): number {
  const { rt, bands, lambdaRef, chromaticSlope, amp, body, target, parentStar } = args;
  if (
    !body ||
    !parentStar ||
    !(body.sky.z > parentStar.sky.z) ||
    (rt.target ?? "planet") !== target ||
    amp <= 0
  ) {
    return 0;
  }
  const contactRadius = parentStar.r + body.r;
  const impact = Math.hypot(body.sky.x - parentStar.sky.x, body.sky.y - parentStar.sky.y);
  const sigma = refractionWidth(rt, body, parentStar);
  const distance = impact - contactRadius;
  const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma));
  return amp * weight * refractionBandWeight(bands, lambdaRef, chromaticSlope);
}

function computeRefraction(config: SimulationConfigV4, snap: NativeSnapshot): number {
  const rt = config.photometry?.atmosphereRT;
  if (!(rt?.enabled && rt.refraction?.enabled)) return 0;
  const bands = resolveWeightedPhotometryBands(config);
  const lambdaRef = Number.isFinite(rt.lambdaRefNm) ? Math.max(1, rt.lambdaRefNm as number) : 550;
  const chromaticSlope = Number.isFinite(rt.refraction.chromaticSlope)
    ? (rt.refraction.chromaticSlope as number)
    : 0;
  const amp = Number.isFinite(rt.refraction.amp) ? Math.max(0, rt.refraction.amp as number) : 0;
  const firstPlanet = snap.planets[0];
  const firstMoon = snap.moons[0];
  const planetParentStar = firstPlanet ? starParentForBody(snap, firstPlanet, snap.stars[0]) : undefined;
  const moonParentStar = firstMoon ? starParentForMoon(snap, firstMoon, snap.stars[0]) : undefined;

  return (
    refractionForBody({
      rt,
      bands,
      lambdaRef,
      chromaticSlope,
      amp,
      body: firstPlanet,
      target: "planet",
      parentStar: planetParentStar,
    }) +
    refractionForBody({
      rt,
      bands,
      lambdaRef,
      chromaticSlope,
      amp,
      body: firstMoon,
      target: "moon",
      parentStar: moonParentStar,
    })
  );
}

function computeTransitFactor(
  config: SimulationConfigV4,
  snap: NativeSnapshot,
  nonStars: NativeBodyState[],
): number {
  const transitPrimaryStar = snap.stars[0];
  return transitPrimaryStar
    ? starVisibilityFromOcculters(
        config,
        transitPrimaryStar,
        nonStars
          .filter((oc) => oc.sky.z > transitPrimaryStar.sky.z)
          .map((oc) => ({ ...oc, opacity: atmosphereOpacityForOcculter(config, oc) })),
      )
    : 1;
}

function visibleFractionWhenOcculted(
  foreground: NativeBodyState,
  background: NativeBodyState,
  overlap: number,
): number | undefined {
  const area = Math.PI * background.r * background.r;
  return foreground.sky.z > background.sky.z && area > 0 ? clamp01(1 - overlap / area) : undefined;
}

function overlappingVisibleFractions(planet: NativeBodyState, moon: NativeBodyState): VisibleFractions {
  const d = Math.hypot(planet.sky.x - moon.sky.x, planet.sky.y - moon.sky.y);
  const overlap = circleOverlapArea(planet.r, moon.r, d);
  return {
    planetVisibleFraction: visibleFractionWhenOcculted(moon, planet, overlap) ?? 1,
    moonVisibleFraction: visibleFractionWhenOcculted(planet, moon, overlap) ?? 1,
  };
}

function computeVisibleFractions(snap: NativeSnapshot): VisibleFractions {
  const firstPlanet = snap.planets[0];
  const firstMoon = snap.moons[0];
  if (firstPlanet && firstMoon) return overlappingVisibleFractions(firstPlanet, firstMoon);
  return {
    planetVisibleFraction: firstPlanet ? 1 : undefined,
    moonVisibleFraction: firstMoon ? 1 : undefined,
  };
}

export function computeFluxBundle(
  config: SimulationConfigV4,
  snap: NativeSnapshot,
  tObsSec: number,
): FluxBundle {
  const luminousStars = activeLuminousStars(snap);
  const nonStars = activeNonStarOcculters(snap);
  const visibility = computeVisibilityBundle(config, snap, luminousStars, nonStars);
  const stellar = computeStellarComponents(config, snap, luminousStars, visibility, tObsSec);
  const additivePlanetary = computeAdditivePlanetary(config, snap);
  const additiveLunar = computeAdditiveLunar(config, snap);
  const scattering = computeScatteringComponents(config, snap);
  const refraction = computeRefraction(config, snap);

  // Compute transitFactor from planet/moon transits only (not binary eclipse),
  // so it reflects the planet transit depth independent of binary stellar eclipses.
  const transitFactor = computeTransitFactor(config, snap, nonStars);
  const total =
    stellar.stellarPreTransit * transitFactor +
    additivePlanetary +
    additiveLunar +
    scattering.forwardScattering +
    scattering.ringScattering +
    refraction;
  const visibleFractions = computeVisibleFractions(snap);

  return {
    stellarA: stellar.stellarA,
    stellarB: stellar.stellarB,
    stellarPreTransit: stellar.stellarPreTransit,
    binaryEclipseFactor: stellar.binaryEclipseFactor,
    transitFactor,
    additivePlanetary,
    additiveLunar,
    forwardScattering: scattering.forwardScattering,
    ringScattering: scattering.ringScattering,
    refraction,
    stellarVariability: stellar.stellarVariability,
    total,
    nOcculters: visibility.nOcculters,
    planetVisibleFraction: visibleFractions.planetVisibleFraction,
    moonVisibleFraction: visibleFractions.moonVisibleFraction,
  };
}
