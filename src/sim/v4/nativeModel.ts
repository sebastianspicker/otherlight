import { clamp01 } from "../../core/units";
import { computeForwardScatteringFlux } from "../../photometry/forwardScattering";
import { bodyPhaseFlux } from "../../photometry/phaseCurve";
import { resolveDetachedBinaryLuminosities } from "../../photometry/stellarBandFlux";
import { orbitalPhaseFromPeriod, stellarVariabilityFlux } from "../../photometry/stellarVariability";
import { projectToSky } from "../../physics/frames";
import type { SolveKeplerEOptions } from "../../physics/kepler";
import type { Vec3 } from "../../physics/vec3";
import { vAdd, vScale, vSub } from "../../physics/vec3";
import { posFromResolvedElements } from "../orbits";
import {
  atmosphereOpacityForOcculter,
  circleOverlapArea,
  gaussianPhaseWeight,
  resolveWeightedPhotometryBands,
  starVisibilityFromOpaqueOcculters,
} from "./nativePhotometry";
import {
  assertScientificBrowserSnapshotInputs,
  finiteOrDefault,
  hierarchyParentMap,
  keplerOptionsForExecutionMode,
  normalizeObserverDir,
  safeBodyRadius,
} from "./nativeSnapshotHelpers";
import type { MoonBodyV4, PlanetBodyV4, SimulationConfigV4, StarBodyV4 } from "./types";
import { createScientificBrowserRuntimeError } from "./scientificErrors";

export { finiteOrDefault } from "./nativeSnapshotHelpers";

type NativeBodyKind = "star" | "planet" | "moon";

export type NativeBodyState = {
  id: string;
  kind: NativeBodyKind;
  r: number;
  m: number;
  luminosity: number;
  active: boolean;
  parentId?: string;
  rAbs: Vec3;
  vAbs: Vec3;
  sky: { x: number; y: number; z: number };
  source: StarBodyV4 | PlanetBodyV4 | MoonBodyV4;
};

export type NativeSnapshot = {
  observerDir: Vec3;
  bodies: NativeBodyState[];
  stars: NativeBodyState[];
  planets: NativeBodyState[];
  moons: NativeBodyState[];
  byId: Map<string, NativeBodyState>;
};

export type ConservationBaseline = {
  energy?: number;
  angularMomentum?: number;
};

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

// TODO: The velocity here is computed via central finite differences (3 Kepler
// solves).  An analytical velocity from the vis-viva equation and the orbital
// state vector would eliminate 2 of the 3 solves and improve both accuracy and
// performance.
export function orbitStateAt(
  el: { a: number; e: number; inc: number; Omega: number; omega: number; period: number; t0: number },
  t: number,
  keplerOpts?: SolveKeplerEOptions,
): {
  r: Vec3;
  v: Vec3;
} {
  const dt = Math.max(0.01, el.period * 1e-4);
  const r = posFromResolvedElements(el, t, "v4.orbit", keplerOpts);
  const rp = posFromResolvedElements(el, t + dt, "v4.orbit", keplerOpts);
  const rm = posFromResolvedElements(el, t - dt, "v4.orbit", keplerOpts);
  return {
    r,
    v: vScale(vSub(rp, rm), 1 / (2 * dt)),
  };
}

export function buildNativeSnapshot(config: SimulationConfigV4, tObsSec: number): NativeSnapshot {
  assertScientificBrowserSnapshotInputs(config);
  const observerDir = normalizeObserverDir(config);
  const keplerOpts = keplerOptionsForExecutionMode(config.runtime?.executionMode);
  const byId = new Map<string, NativeBodyState>();
  const stars: NativeBodyState[] = [];
  const planets: NativeBodyState[] = [];
  const moons: NativeBodyState[] = [];
  const hmap = hierarchyParentMap(config);

  const [starA, starB] = config.bodies.stars;
  const binary = orbitStateAt(config.orbits.binary, tObsSec, keplerOpts);
  const mA = finiteOrDefault(starA.m, 0);
  const mB = finiteOrDefault(starB.m, 0);
  const mTot = mA > 0 && mB > 0 ? mA + mB : 0;
  const wA = mTot > 0 ? -mB / mTot : 0;
  const wB = mTot > 0 ? mA / mTot : 1;

  const fallbackPassband =
    config.runtime?.executionMode === "scientific-browser"
      ? undefined
      : config.photometry?.limbDarkeningModel?.bandpass;
  const detachedBinaryLuminosities = resolveDetachedBinaryLuminosities({
    primary: starA,
    secondary: starB,
    fallbackPassband,
    secondaryFallbackLuminosityScale:
      config.runtime?.executionMode === "scientific-browser"
        ? 0
        : config.mode === "detached-binary-lab"
          ? 0.3
          : 0,
  });
  if (
    config.runtime?.executionMode === "scientific-browser" &&
    config.mode === "detached-binary-lab" &&
    detachedBinaryLuminosities.source !== "physical-bandpass"
  ) {
    throw createScientificBrowserRuntimeError({
      stage: "native-inputs",
      code: "SCB_BINARY_PHOTOMETRY_FALLBACK",
      summary: "native detached-binary scientific-browser snapshot requires physical bandpass weighting",
      details: [
        "detached-binary scientific-browser native snapshot rejects compatibility luminosity scaling",
        "provide explicit per-star physical photometry inputs (radius, teffK, passband)",
      ],
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
      },
    });
  }
  const lumA = detachedBinaryLuminosities.primary;
  const lumBraw = detachedBinaryLuminosities.secondary;
  const starBActive = config.mode === "detached-binary-lab" || lumBraw > 0;

  const starAState: NativeBodyState = {
    id: starA.id,
    kind: "star",
    r: safeBodyRadius(starA),
    m: Math.max(0, mA),
    luminosity: lumA,
    active: true,
    rAbs: vScale(binary.r, wA),
    vAbs: vScale(binary.v, wA),
    sky: projectToSky(vScale(binary.r, wA), observerDir),
    source: starA,
  };
  const starBState: NativeBodyState = {
    id: starB.id,
    kind: "star",
    r: starBActive ? safeBodyRadius(starB) : 0,
    m: Math.max(0, mB),
    luminosity: starBActive ? lumBraw : 0,
    active: starBActive,
    rAbs: vScale(binary.r, wB),
    vAbs: vScale(binary.v, wB),
    sky: projectToSky(vScale(binary.r, wB), observerDir),
    source: starB,
  };
  byId.set(starAState.id, starAState);
  byId.set(starBState.id, starBState);
  stars.push(starAState, starBState);

  const requireKnownParent = (
    bodyKind: "planet" | "moon",
    bodyId: string,
    parentId?: string,
  ): NativeBodyState | undefined => {
    if (!parentId) {
      if (bodyKind === "moon") {
        if (config.runtime?.executionMode === "scientific-browser") {
          throw createScientificBrowserRuntimeError({
            stage: "native-inputs",
            code: "SCB_INVALID_NATIVE_INPUTS",
            summary: "native snapshot inputs are invalid for scientific-browser execution",
            details: [`moon "${bodyId}" is missing a parent planet reference`],
            context: {
              executionMode: config.runtime?.executionMode ?? "interactive",
              runtimeMode: config.runtime?.mode ?? "realtime",
            },
          });
        }
        throw new Error(`buildNativeSnapshot: moon "${bodyId}" is missing a parent planet reference.`);
      }
      return undefined;
    }
    const parent = byId.get(parentId);
    if (!parent) {
      if (config.runtime?.executionMode === "scientific-browser") {
        throw createScientificBrowserRuntimeError({
          stage: "native-inputs",
          code: "SCB_INVALID_NATIVE_INPUTS",
          summary: "native snapshot inputs are invalid for scientific-browser execution",
          details: [`unknown parent "${parentId}" for ${bodyKind} "${bodyId}"`],
          context: {
            executionMode: config.runtime?.executionMode ?? "interactive",
            runtimeMode: config.runtime?.mode ?? "realtime",
          },
        });
      }
      throw new Error(`buildNativeSnapshot: unknown parent "${parentId}" for ${bodyKind} "${bodyId}".`);
    }
    return parent;
  };

  for (const p of config.bodies.planets) {
    const rel = orbitStateAt(p.orbit, tObsSec, keplerOpts);
    const parentFromHierarchy = hmap.get(p.id);
    const parentId =
      p.parentSystem === "circumbinary" ? undefined : (p.parentStarId ?? parentFromHierarchy ?? starA.id);
    const parent = requireKnownParent("planet", p.id, parentId);
    const rBase = parent ? parent.rAbs : ({ x: 0, y: 0, z: 0 } as Vec3);
    const vBase = parent ? parent.vAbs : ({ x: 0, y: 0, z: 0 } as Vec3);
    const rAbs = vAdd(rBase, rel.r);
    const vAbs = vAdd(vBase, rel.v);
    const st: NativeBodyState = {
      id: p.id,
      kind: "planet",
      r: safeBodyRadius(p),
      m: Math.max(0, finiteOrDefault(p.m, 0)),
      luminosity: 0,
      active: true,
      parentId,
      rAbs,
      vAbs,
      sky: projectToSky(rAbs, observerDir),
      source: p,
    };
    byId.set(st.id, st);
    planets.push(st);
  }

  for (const m of config.bodies.moons) {
    const rel = orbitStateAt(m.orbit, tObsSec, keplerOpts);
    const parentFromHierarchy = hmap.get(m.id);
    const parentId = m.parentPlanetId ?? parentFromHierarchy;
    const parent = requireKnownParent("moon", m.id, parentId);
    const rBase = parent ? parent.rAbs : ({ x: 0, y: 0, z: 0 } as Vec3);
    const vBase = parent ? parent.vAbs : ({ x: 0, y: 0, z: 0 } as Vec3);
    const rAbs = vAdd(rBase, rel.r);
    const vAbs = vAdd(vBase, rel.v);
    const st: NativeBodyState = {
      id: m.id,
      kind: "moon",
      r: safeBodyRadius(m),
      m: Math.max(0, finiteOrDefault(m.m, 0)),
      luminosity: 0,
      active: true,
      parentId,
      rAbs,
      vAbs,
      sky: projectToSky(rAbs, observerDir),
      source: m,
    };
    byId.set(st.id, st);
    moons.push(st);
  }

  return {
    observerDir,
    bodies: [...stars, ...planets, ...moons],
    stars,
    planets,
    moons,
    byId,
  };
}

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

    const areaStar = Math.PI * st.r * st.r;
    let blocked = 0;
    let blockedByStars = 0;
    const occulters: NativeBodyState[] = [...nonStars, ...frontStars];
    for (const oc of occulters) {
      if (!(oc.sky.z > st.sky.z)) continue;
      const d = Math.hypot(oc.sky.x - st.sky.x, oc.sky.y - st.sky.y);
      if (!(d < st.r + oc.r)) continue;
      const overlap = circleOverlapArea(st.r, oc.r, d);
      const opacity = oc.kind === "star" ? 1 : atmosphereOpacityForOcculter(config, oc);
      blocked += overlap * opacity;
      if (oc.kind === "star") blockedByStars += overlap;
      if (st.id === snap.stars[0]?.id && oc.kind !== "star") nOcculters++;
    }
    const vis = clamp01(1 - Math.min(1, blocked / areaStar));
    const visBinary = clamp01(1 - Math.min(1, blockedByStars / areaStar));
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
    const phase = orbitalPhaseFromPeriod({
      t: tObsSec,
      period: orbit.orbit.period,
      t0: orbit.orbit.t0,
    });

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
  const primaryLum = snap.stars[0]?.luminosity ?? 0;
  // Compute how much of the primary star's light is blocked by non-stellar bodies only.
  const primaryArea =
    primaryLum > 0 && snap.stars[0]?.r > 0 ? Math.PI * snap.stars[0].r * snap.stars[0].r : 0;
  let planetaryBlocked = 0;
  if (primaryArea > 0) {
    for (const oc of nonStars) {
      if (!(oc.sky.z > (snap.stars[0]?.sky.z ?? 0))) continue;
      const d = Math.hypot(oc.sky.x - (snap.stars[0]?.sky.x ?? 0), oc.sky.y - (snap.stars[0]?.sky.y ?? 0));
      if (!(d < snap.stars[0].r + oc.r)) continue;
      const overlap = circleOverlapArea(snap.stars[0].r, oc.r, d);
      const opacity = atmosphereOpacityForOcculter(config, oc);
      planetaryBlocked += overlap * opacity;
    }
  }
  const transitFactor = primaryArea > 0 ? clamp01(1 - Math.min(1, planetaryBlocked / primaryArea)) : 1;

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
