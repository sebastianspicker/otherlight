/** Computes native V4 atmospheric scattering and refraction contributions. */
import { transitCenteredPhaseRadFromBodyPos } from "../../photometry/dayNightVisibility";
import { computeForwardScatteringFlux } from "../../photometry/forwardScattering";
import { vSub } from "../../orbits/vec3";
import { gaussianPhaseWeight, resolveWeightedPhotometryBands } from "./nativePhotometry";
import { starParentForBody, starParentForMoon } from "./nativeModelRelations";
import type { NativeBodyState, NativeSnapshot } from "./nativeSnapshot";
import type { PlanetBodyV4, EducationScenarioV4 } from "./types";

type AtmosphereRTConfig = NonNullable<NonNullable<EducationScenarioV4["photometry"]>["atmosphereRT"]>;
type WeightedPhotometryBands = ReturnType<typeof resolveWeightedPhotometryBands>;
export type ScatteringComponents = { forwardScattering: number; ringScattering: number };

export function computeScatteringComponents(
  config: EducationScenarioV4,
  snap: NativeSnapshot,
): ScatteringComponents {
  const planet = snap.planets[0];
  if (!planet) return { forwardScattering: 0, ringScattering: 0 };
  const parentStar = starParentForBody(snap, planet, snap.stars[0]);
  const rel = parentStar ? vSub(planet.rAbs, parentStar.rAbs) : planet.rAbs;
  const phase = transitCenteredPhaseRadFromBodyPos(rel, snap.observerDir);
  return {
    forwardScattering: forwardScatteringForPlanet(config, snap, planet, parentStar, phase),
    ringScattering: ringScatteringForPlanet(config, planet, phase),
  };
}

export function computeRefraction(config: EducationScenarioV4, snap: NativeSnapshot): number {
  const rt = config.photometry?.atmosphereRT;
  if (!(rt?.enabled && rt.refraction?.enabled)) return 0;
  const bands = resolveWeightedPhotometryBands(config);
  const lambdaRef = Number.isFinite(rt.lambdaRefNm) ? Math.max(1, rt.lambdaRefNm as number) : 550;
  const chromaticSlope = Number.isFinite(rt.refraction.chromaticSlope)
    ? (rt.refraction.chromaticSlope as number)
    : 0;
  const amp = Number.isFinite(rt.refraction.amp) ? Math.max(0, rt.refraction.amp as number) : 0;
  const planet = snap.planets[0];
  const moon = snap.moons[0];
  return (
    refractionForBody({
      rt,
      bands,
      lambdaRef,
      chromaticSlope,
      amp,
      body: planet,
      target: "planet",
      parentStar: planet ? starParentForBody(snap, planet, snap.stars[0]) : undefined,
    }) +
    refractionForBody({
      rt,
      bands,
      lambdaRef,
      chromaticSlope,
      amp,
      body: moon,
      target: "moon",
      parentStar: moon ? starParentForMoon(snap, moon, snap.stars[0]) : undefined,
    })
  );
}

const forwardScatteringForPlanet = (
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  planet: NativeBodyState,
  parentStar: NativeBodyState | undefined,
  phase: number,
): number => {
  const rel = parentStar ? vSub(planet.rAbs, parentStar.rAbs) : planet.rAbs;
  return computeForwardScatteringFlux({
    rBody: rel,
    observerDir: snap.observerDir,
    model: config.photometry?.forwardScattering,
    phase: Number.isFinite(phase) ? phase : undefined,
  });
};

const ringScatteringForPlanet = (
  config: EducationScenarioV4,
  planet: NativeBodyState,
  phase: number,
): number => {
  const ringScattering = config.photometry?.ringScattering;
  const orbit = planet.source as PlanetBodyV4;
  if (!(ringScattering?.enabled && orbit.rings && Number.isFinite(ringScattering.amp))) return 0;
  const amp = Math.max(0, ringScattering.amp as number);
  if (amp <= 0) return 0;
  const sigma = Number.isFinite(ringScattering.sigmaPhase)
    ? Math.max(1e-4, ringScattering.sigmaPhase as number)
    : 0.25;
  const phaseWeight = Number.isFinite(phase) ? gaussianPhaseWeight(phase, sigma) : 0;
  const inclination = Number.isFinite(orbit.rings.inclination) ? (orbit.rings.inclination as number) : 0;
  return amp * phaseWeight * Math.max(0.1, Math.min(1, Math.abs(Math.cos(inclination))));
};

const refractionForBody = (args: {
  rt: AtmosphereRTConfig;
  bands: WeightedPhotometryBands;
  lambdaRef: number;
  chromaticSlope: number;
  amp: number;
  body: NativeBodyState | undefined;
  target: "planet" | "moon";
  parentStar: NativeBodyState | undefined;
}): number => {
  const { rt, bands, lambdaRef, chromaticSlope, amp, body, target, parentStar } = args;
  if (
    !body ||
    !parentStar ||
    !(body.sky.z > parentStar.sky.z) ||
    (rt.target ?? "planet") !== target ||
    amp <= 0
  )
    return 0;
  const contactRadius = parentStar.r + body.r;
  const impact = Math.hypot(body.sky.x - parentStar.sky.x, body.sky.y - parentStar.sky.y);
  const sigma =
    Number.isFinite(rt.refraction?.width) && (rt.refraction?.width as number) > 0
      ? (rt.refraction?.width as number)
      : Math.max(body.r * 0.8, parentStar.r * 0.04);
  const distance = impact - contactRadius;
  const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma));
  let bandWeighted = 0;
  for (const band of bands)
    bandWeighted += band.weight * Math.pow(Math.max(1, band.lambdaNm) / lambdaRef, -chromaticSlope);
  return amp * weight * bandWeighted;
};
