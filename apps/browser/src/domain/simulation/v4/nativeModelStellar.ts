/** Computes native V4 stellar visibility and variability components. */
import { clamp01 } from "../../model/units";
import { stellarVariabilityFlux } from "../../photometry/stellarVariability";
import {
  photometricOcculterForBody,
  starVisibilityFromOcculters,
  starVisibilityFromOpaqueOcculters,
} from "./nativePhotometry";
import type { NativeBodyState, NativeSnapshot } from "./nativeSnapshot";
import type { EducationScenarioV4 } from "./types";

export type VisibilityBundle = {
  byStar: Map<string, number>;
  byStarBinary: Map<string, number>;
  nOcculters: number;
};
export type StellarComponents = {
  stellarA: number;
  stellarB: number;
  stellarPreTransit: number;
  binaryEclipseFactor: number;
  stellarVariability: number;
  transitFactor: number;
};
type StellarSurfaceConfig = NonNullable<NonNullable<EducationScenarioV4["photometry"]>["stellarSurface"]>;

export const activeLuminousStars = (snap: NativeSnapshot): NativeBodyState[] =>
  snap.stars.filter((star) => star.active && star.luminosity > 0 && star.r > 0);
export const activeNonStarOcculters = (snap: NativeSnapshot): NativeBodyState[] =>
  snap.bodies.filter((body) => body.kind !== "star" && body.active && body.r > 0);

export function computeVisibilityBundle(
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  luminousStars: NativeBodyState[],
  nonStars: NativeBodyState[],
): VisibilityBundle {
  const byStar = new Map<string, number>();
  const byStarBinary = new Map<string, number>();
  let nOcculters = 0;
  for (const star of luminousStars) {
    const frontStars = luminousStars.filter((other) => other.id !== star.id && other.sky.z > star.sky.z);
    const visibility = visibilityForStar(config, snap, star, frontStars, nonStars);
    byStar.set(star.id, visibility.visible);
    byStarBinary.set(star.id, visibility.binaryVisible);
    nOcculters += visibility.nOcculters;
  }
  return { byStar, byStarBinary, nOcculters };
}

export function computeStellarComponents(
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  luminousStars: NativeBodyState[],
  visibility: VisibilityBundle,
  tObsSec: number,
): StellarComponents {
  const stellarBaseline = luminousStars.reduce((sum, star) => sum + star.luminosity, 0);
  const stellarFromBinaryEclipses = stellarFluxAfterBinaryEclipses(luminousStars, visibility);
  const stellarVariability = stellarSurfaceVariability(config, tObsSec);
  const stellarAfterAllOccultations = stellarFluxAfterAllOccultations(luminousStars, visibility);
  const primaryBinaryVis = visibility.byStarBinary.get(snap.stars[0]?.id ?? "") ?? 1;
  const primaryAllVis = visibility.byStar.get(snap.stars[0]?.id ?? "") ?? 1;
  const stellarPreTransit = stellarFromBinaryEclipses + stellarVariability * primaryBinaryVis;
  const stellarAfterTransit = stellarAfterAllOccultations + stellarVariability * primaryAllVis;
  const stellarA = visibleStellarFlux(snap, visibility, 0);
  const stellarB = visibleStellarFlux(snap, visibility, 1);
  const eclipseFactor = binaryEclipseFactor(stellarBaseline, stellarFromBinaryEclipses);
  const transitFactor = transitFactorForStellarFlux(stellarPreTransit, stellarAfterTransit);
  return {
    stellarA,
    stellarB,
    binaryEclipseFactor: eclipseFactor,
    stellarVariability,
    stellarPreTransit,
    transitFactor,
  };
}

const binaryEclipseFactor = (stellarBaseline: number, stellarFromBinaryEclipses: number): number =>
  stellarBaseline > 0 ? clamp01(stellarFromBinaryEclipses / stellarBaseline) : 1;

const transitFactorForStellarFlux = (stellarPreTransit: number, stellarAfterTransit: number): number =>
  stellarPreTransit > 0 ? clamp01(stellarAfterTransit / stellarPreTransit) : 1;

const stellarFluxAfterBinaryEclipses = (
  luminousStars: NativeBodyState[],
  visibility: VisibilityBundle,
): number =>
  luminousStars.reduce((sum, star) => sum + star.luminosity * (visibility.byStarBinary.get(star.id) ?? 1), 0);

const stellarFluxAfterAllOccultations = (
  luminousStars: NativeBodyState[],
  visibility: VisibilityBundle,
): number =>
  luminousStars.reduce((sum, star) => sum + star.luminosity * (visibility.byStar.get(star.id) ?? 1), 0);

const visibilityForStar = (
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  star: NativeBodyState,
  frontStars: NativeBodyState[],
  nonStars: NativeBodyState[],
): { visible: number; binaryVisible: number; nOcculters: number } => {
  if (config.mode === "detached-binary-lab" && nonStars.length === 0) {
    const binaryVisible = starVisibilityFromOpaqueOcculters(config, star, frontStars);
    return { visible: binaryVisible, binaryVisible, nOcculters: 0 };
  }
  const occulters = [...nonStars, ...frontStars];
  return {
    visible: starVisibilityFromOcculters(
      config,
      star,
      occulters
        .filter((occulter) => occulter.sky.z > star.sky.z)
        .map((occulter) => photometricOcculterForBody(config, occulter)),
    ),
    binaryVisible: starVisibilityFromOpaqueOcculters(config, star, frontStars),
    nOcculters:
      star.id === snap.stars[0]?.id
        ? occulters.filter((occulter) => occulter.kind !== "star" && occulter.sky.z > star.sky.z).length
        : 0,
  };
};

const stellarSurfaceVariability = (config: EducationScenarioV4, tObsSec: number): number => {
  const surface = config.photometry?.stellarSurface;
  return (
    stellarVariabilityFlux({
      t: tObsSec,
      orbit: config.bodies.planets[0]?.orbit ?? config.orbits.binary,
      model: config.photometry?.stellarVariability,
    }) +
    granulationFlux(surface, tObsSec) +
    activityCycleFlux(surface, tObsSec)
  );
};

const granulationFlux = (surface: StellarSurfaceConfig | undefined, tObsSec: number): number =>
  surface?.enabled && Number.isFinite(surface.granulationSigma)
    ? (surface.granulationSigma as number) *
      Math.sin((2 * Math.PI * tObsSec) / Math.max(1, surface.granulationTimescaleSec ?? 300))
    : 0;
const activityCycleFlux = (surface: StellarSurfaceConfig | undefined, tObsSec: number): number =>
  surface?.enabled &&
  Number.isFinite(surface.activityCyclePeriodSec) &&
  Number.isFinite(surface.activityCycleAmp)
    ? (surface.activityCycleAmp as number) *
      Math.sin((2 * Math.PI * tObsSec) / Math.max(1, surface.activityCyclePeriodSec as number))
    : 0;
const visibleStellarFlux = (snap: NativeSnapshot, visibility: VisibilityBundle, index: number): number =>
  (snap.stars[index]?.luminosity ?? 0) * (visibility.byStar.get(snap.stars[index]?.id ?? "") ?? 1);
