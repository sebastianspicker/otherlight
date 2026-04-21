import { clamp01 } from "../../core/units";
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

export function computeFluxBundle(
  config: SimulationConfigV4,
  snap: NativeSnapshot,
  tObsSec: number,
): FluxBundle {
  const luminousStars = snap.stars.filter((s) => s.active && s.luminosity > 0 && s.r > 0);
  const visByStar = new Map<string, number>();
  const visByStarBinary = new Map<string, number>();

  const nonStars = snap.bodies.filter((b) => b.kind !== "star" && b.active && b.r > 0);
  let nOcculters = 0;

  for (const st of luminousStars) {
    const frontStars = luminousStars.filter((o) => o.id !== st.id && o.sky.z > st.sky.z);
    if (config.mode === "detached-binary-lab" && nonStars.length === 0) {
      const visBinary = starVisibilityFromOpaqueOcculters(config, st, frontStars);
      visByStar.set(st.id, visBinary);
      visByStarBinary.set(st.id, visBinary);
      continue;
    }

    const occulters: NativeBodyState[] = [...nonStars, ...frontStars];
    const weightedOcculters = occulters
      .filter((oc) => oc.sky.z > st.sky.z)
      .map((oc) => ({
        ...oc,
        opacity: oc.kind === "star" ? 1 : atmosphereOpacityForOcculter(config, oc),
      }));
    for (const oc of occulters) {
      if (!(oc.sky.z > st.sky.z)) continue;
      if (st.id === snap.stars[0]?.id && oc.kind !== "star") nOcculters++;
    }
    const vis = starVisibilityFromOcculters(config, st, weightedOcculters);
    const visBinary = starVisibilityFromOpaqueOcculters(config, st, frontStars);
    visByStar.set(st.id, vis);
    visByStarBinary.set(st.id, visBinary);
  }

  const stellarA = (snap.stars[0]?.luminosity ?? 0) * (visByStar.get(snap.stars[0]?.id ?? "") ?? 1);
  const stellarB = (snap.stars[1]?.luminosity ?? 0) * (visByStar.get(snap.stars[1]?.id ?? "") ?? 1);
  const stellarBaseline = luminousStars.reduce((sum, star) => sum + star.luminosity, 0);
  const stellarFromBinaryEclipses = luminousStars.reduce(
    (sum, star) => sum + star.luminosity * (visByStarBinary.get(star.id) ?? 1),
    0,
  );
  const stellarFromEclipses = stellarA + stellarB;
  const binaryEclipseFactor = stellarBaseline > 0 ? clamp01(stellarFromBinaryEclipses / stellarBaseline) : 1;

  const primaryStar = snap.stars[0];
  const phot = config.photometry;
  const primaryOrbit = config.bodies.planets[0]?.orbit ?? config.orbits.binary;
  const variability = stellarVariabilityFlux({
    t: tObsSec,
    orbit: primaryOrbit,
    model: phot?.stellarVariability,
  });
  const surf = phot?.stellarSurface;
  const granulation =
    surf?.enabled && Number.isFinite(surf.granulationSigma)
      ? (surf.granulationSigma as number) *
        Math.sin((2 * Math.PI * tObsSec) / Math.max(1, surf.granulationTimescaleSec ?? 300))
      : 0;
  const activity =
    surf?.enabled && Number.isFinite(surf.activityCyclePeriodSec) && Number.isFinite(surf.activityCycleAmp)
      ? (surf.activityCycleAmp as number) *
        Math.sin((2 * Math.PI * tObsSec) / Math.max(1, surf.activityCyclePeriodSec as number))
      : 0;
  const stellarVariability = variability + granulation + activity;
  // Stellar variability is photospheric — it must be attenuated by the same
  // transit visibility factor that dims the primary star's baseline luminosity.
  const primaryVis = visByStar.get(snap.stars[0]?.id ?? "") ?? 1;
  const stellarPreTransit = stellarFromEclipses + stellarVariability * primaryVis;

  const planetPhaseModel = phot?.phaseCurve;
  const moonPhaseModel = phot?.moonPhaseCurve;
  let additivePlanetary = 0;
  for (const pl of snap.planets) {
    const parentStar =
      pl.parentId && snap.byId.get(pl.parentId)?.kind === "star"
        ? (snap.byId.get(pl.parentId) as NativeBodyState)
        : primaryStar;
    const rel = parentStar ? vSub(pl.rAbs, parentStar.rAbs) : pl.rAbs;
    additivePlanetary += bodyPhaseFlux({
      rBody: rel,
      rBodyRadius: pl.r,
      rStarRadius: parentStar?.r,
      observerDir: snap.observerDir,
      orbitPeriodSec: (pl.source as PlanetBodyV4).orbit.period,
      model: planetPhaseModel,
      dayNightVisibility: phot?.dayNightVisibility,
      thermalModelAdvanced: phot?.thermalModelAdvanced,
    });
  }
  let additiveLunar = 0;
  for (const mn of snap.moons) {
    const parentPlanet = mn.parentId ? snap.byId.get(mn.parentId) : undefined;
    const parentStar =
      parentPlanet?.parentId && snap.byId.get(parentPlanet.parentId)?.kind === "star"
        ? (snap.byId.get(parentPlanet.parentId) as NativeBodyState)
        : primaryStar;
    const rel = parentStar ? vSub(mn.rAbs, parentStar.rAbs) : mn.rAbs;
    additiveLunar += bodyPhaseFlux({
      rBody: rel,
      rBodyRadius: mn.r,
      rStarRadius: parentStar?.r,
      observerDir: snap.observerDir,
      orbitPeriodSec: (mn.source as MoonBodyV4).orbit.period,
      model: moonPhaseModel,
      dayNightVisibility: phot?.dayNightVisibility,
      thermalModelAdvanced: phot?.thermalModelAdvanced,
    });
  }

  let forwardScattering = 0;
  let ringScattering = 0;
  let refraction = 0;
  const firstPlanet = snap.planets[0];
  if (firstPlanet) {
    const parentStar =
      firstPlanet.parentId && snap.byId.get(firstPlanet.parentId)?.kind === "star"
        ? (snap.byId.get(firstPlanet.parentId) as NativeBodyState)
        : primaryStar;
    const rel = parentStar ? vSub(firstPlanet.rAbs, parentStar.rAbs) : firstPlanet.rAbs;
    const orbit = firstPlanet.source as PlanetBodyV4;
    const phase = transitCenteredPhaseRadFromBodyPos(rel, snap.observerDir);

    forwardScattering = computeForwardScatteringFlux({
      rBody: rel,
      observerDir: snap.observerDir,
      model: phot?.forwardScattering,
      phase: Number.isFinite(phase) ? phase : undefined,
    });

    const ringSc = phot?.ringScattering;
    if (ringSc?.enabled && orbit.rings && Number.isFinite(ringSc.amp)) {
      const amp = Math.max(0, ringSc.amp as number);
      if (amp > 0) {
        const sigma = Number.isFinite(ringSc.sigmaPhase) ? Math.max(1e-4, ringSc.sigmaPhase as number) : 0.25;
        const phaseW = Number.isFinite(phase) ? gaussianPhaseWeight(phase, sigma) : 0;
        const inc = Number.isFinite(orbit.rings.inclination) ? (orbit.rings.inclination as number) : 0;
        const tilt = Math.max(0.1, Math.min(1, Math.abs(Math.cos(inc))));
        ringScattering = amp * phaseW * tilt;
      }
    }
  }

  const rt = phot?.atmosphereRT;
  if (rt?.enabled && rt.refraction?.enabled) {
    const bands = resolveWeightedPhotometryBands(config);
    const lambdaRef = Number.isFinite(rt.lambdaRefNm) ? Math.max(1, rt.lambdaRefNm as number) : 550;
    const chromaticSlope = Number.isFinite(rt.refraction.chromaticSlope)
      ? (rt.refraction.chromaticSlope as number)
      : 0;
    const amp = Number.isFinite(rt.refraction.amp) ? Math.max(0, rt.refraction.amp as number) : 0;
    const refractionForBody = (
      body: NativeBodyState | undefined,
      target: "planet" | "moon",
      parentStar: NativeBodyState | undefined,
    ): number => {
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
      const sigma =
        Number.isFinite(rt.refraction?.width) && (rt.refraction?.width as number) > 0
          ? (rt.refraction?.width as number)
          : Math.max(body.r * 0.8, parentStar.r * 0.04);
      const distance = impact - contactRadius;
      const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma));
      let bandWeighted = 0;
      for (const band of bands) {
        const wlScale = Math.pow(Math.max(1, band.lambdaNm) / lambdaRef, -chromaticSlope);
        bandWeighted += band.weight * wlScale;
      }
      return amp * weight * bandWeighted;
    };
    const planetParentStar =
      firstPlanet?.parentId && snap.byId.get(firstPlanet.parentId)?.kind === "star"
        ? (snap.byId.get(firstPlanet.parentId) as NativeBodyState)
        : primaryStar;
    refraction += refractionForBody(firstPlanet, "planet", planetParentStar);

    const firstMoon = snap.moons[0];
    if (firstMoon) {
      const moonParent =
        firstMoon.parentId && snap.byId.get(firstMoon.parentId)?.kind === "planet"
          ? snap.byId.get(firstMoon.parentId)
          : undefined;
      const moonParentStar =
        moonParent?.parentId && snap.byId.get(moonParent.parentId)?.kind === "star"
          ? (snap.byId.get(moonParent.parentId) as NativeBodyState)
          : primaryStar;
      refraction += refractionForBody(firstMoon, "moon", moonParentStar);
    }
  }

  const total =
    stellarPreTransit + additivePlanetary + additiveLunar + forwardScattering + ringScattering + refraction;
  // Compute transitFactor from planet/moon transits only (not binary eclipse),
  // so it reflects the planet transit depth independent of binary stellar eclipses.
  const transitPrimaryStar = snap.stars[0];
  const transitFactor = transitPrimaryStar
    ? starVisibilityFromOcculters(
        config,
        transitPrimaryStar,
        nonStars
          .filter((oc) => oc.sky.z > transitPrimaryStar.sky.z)
          .map((oc) => ({ ...oc, opacity: atmosphereOpacityForOcculter(config, oc) })),
      )
    : 1;

  let planetVisibleFraction: number | undefined;
  let moonVisibleFraction: number | undefined;
  const firstMoon = snap.moons[0];
  if (firstPlanet) planetVisibleFraction = 1;
  if (firstMoon) moonVisibleFraction = 1;
  if (firstPlanet && firstMoon) {
    const d = Math.hypot(firstPlanet.sky.x - firstMoon.sky.x, firstPlanet.sky.y - firstMoon.sky.y);
    const overlap = circleOverlapArea(firstPlanet.r, firstMoon.r, d);
    const aP = Math.PI * firstPlanet.r * firstPlanet.r;
    const aM = Math.PI * firstMoon.r * firstMoon.r;
    if (firstMoon.sky.z > firstPlanet.sky.z && aP > 0) planetVisibleFraction = clamp01(1 - overlap / aP);
    if (firstPlanet.sky.z > firstMoon.sky.z && aM > 0) moonVisibleFraction = clamp01(1 - overlap / aM);
  }

  return {
    stellarA,
    stellarB,
    stellarPreTransit,
    binaryEclipseFactor,
    transitFactor,
    additivePlanetary,
    additiveLunar,
    forwardScattering,
    ringScattering,
    refraction,
    stellarVariability,
    total,
    nOcculters,
    planetVisibleFraction,
    moonVisibleFraction,
  };
}
