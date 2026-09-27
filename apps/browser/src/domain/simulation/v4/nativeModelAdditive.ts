/** Computes additive planetary and lunar flux contributions for native V4. */
import { clamp01 } from "../../model/units";
import type { PhaseCurveParams } from "../../model/types";
import { bodyPhaseFlux } from "../../photometry/phaseCurve";
import { vSub } from "../../orbits/vec3";
import { circleOverlapArea } from "./nativePhotometry";
import { starParentForBody, starParentForMoon } from "./nativeModelRelations";
import type { NativeBodyState, NativeSnapshot } from "./nativeSnapshot";
import type { MoonBodyV4, PlanetBodyV4, EducationScenarioV4 } from "./types";

export type VisibleFractions = { planetVisibleFraction?: number; moonVisibleFraction?: number };

export const computeAdditivePlanetary = (config: EducationScenarioV4, snap: NativeSnapshot): number =>
  snap.planets.reduce(
    (sum, planet) =>
      sum +
      phaseFluxForBody(
        config,
        snap,
        planet,
        starParentForBody(snap, planet, snap.stars[0]),
        (planet.source as PlanetBodyV4).orbit.period,
        config.photometry?.phaseCurve,
      ),
    0,
  );
export const computeAdditiveLunar = (config: EducationScenarioV4, snap: NativeSnapshot): number =>
  snap.moons.reduce(
    (sum, moon) =>
      sum +
      phaseFluxForBody(
        config,
        snap,
        moon,
        starParentForMoon(snap, moon, snap.stars[0]),
        (moon.source as MoonBodyV4).orbit.period,
        config.photometry?.moonPhaseCurve,
      ),
    0,
  );

export function computeVisibleFractions(snap: NativeSnapshot): VisibleFractions {
  const planet = snap.planets[0];
  const moon = snap.moons[0];
  if (planet && moon) {
    const overlap = circleOverlapArea(
      planet.r,
      moon.r,
      Math.hypot(planet.sky.x - moon.sky.x, planet.sky.y - moon.sky.y),
    );
    return {
      planetVisibleFraction: visibleFractionWhenOcculted(moon, planet, overlap) ?? 1,
      moonVisibleFraction: visibleFractionWhenOcculted(planet, moon, overlap) ?? 1,
    };
  }
  return { planetVisibleFraction: planet ? 1 : undefined, moonVisibleFraction: moon ? 1 : undefined };
}

const phaseFluxForBody = (
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  body: NativeBodyState,
  parentStar: NativeBodyState | undefined,
  orbitPeriodSec: number,
  model: PhaseCurveParams | undefined,
): number => {
  const rel = parentStar ? vSub(body.rAbs, parentStar.rAbs) : body.rAbs;
  const photometry = config.photometry;
  return bodyPhaseFlux({
    rBody: rel,
    rBodyRadius: body.r,
    rStarRadius: parentStar?.r,
    observerDir: snap.observerDir,
    orbitPeriodSec,
    model,
    dayNightVisibility: photometry?.dayNightVisibility,
    thermalModelAdvanced: photometry?.thermalModelAdvanced,
  });
};

const visibleFractionWhenOcculted = (
  foreground: NativeBodyState,
  background: NativeBodyState,
  overlap: number,
): number | undefined => {
  const area = Math.PI * background.r * background.r;
  return foreground.sky.z > background.sky.z && area > 0 ? clamp01(1 - overlap / area) : undefined;
};
