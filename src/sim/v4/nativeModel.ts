import { clamp01, clamp11 } from "../../core/units";
import { bodyPhaseFlux } from "../../photometry/phaseCurve";
import { totalAtmosphereTransmission } from "../../photometry/atmosphereRT/model";
import { stellarVariabilityFlux } from "../../photometry/stellarVariability";
import { projectToSky } from "../../physics/frames";
import type { Vec3 } from "../../physics/vec3";
import { vAdd, vLenSq, vNormalizeOrZero, vScale, vSub } from "../../physics/vec3";
import { posFromResolvedElements } from "../orbits";
import type { MoonBodyV4, PlanetBodyV4, SimulationConfigV4, StarBodyV4 } from "./types";

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
  stellarVariability: number;
  total: number;
  nOcculters: number;
  planetVisibleFraction?: number;
  moonVisibleFraction?: number;
};

export function finiteOrDefault(x: unknown, d: number): number {
  return Number.isFinite(x) ? (x as number) : d;
}

function finitePositiveOrDefault(x: unknown, d: number): number {
  const v = finiteOrDefault(x, d);
  return v > 0 ? v : d;
}

function normalizeObserverDir(config: SimulationConfigV4): Vec3 {
  const dir = config.observer?.dir;
  const v: Vec3 = {
    x: finiteOrDefault(dir?.x, 0),
    y: finiteOrDefault(dir?.y, 0),
    z: finiteOrDefault(dir?.z, 1),
  };
  const n = vNormalizeOrZero(v);
  if (vLenSq(n) <= 0) return { x: 0, y: 0, z: 1 };
  return n;
}

function circleOverlapArea(r1: number, r2: number, d: number): number {
  if (!(Number.isFinite(r1) && r1 > 0 && Number.isFinite(r2) && r2 > 0 && Number.isFinite(d) && d >= 0))
    return 0;
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) {
    const rMin = Math.min(r1, r2);
    return Math.PI * rMin * rMin;
  }
  const x = (d * d + r1 * r1 - r2 * r2) / (2 * d);
  const y2 = Math.max(0, r1 * r1 - x * x);
  const y = Math.sqrt(y2);
  const a1 = Math.acos(clamp11(x / r1));
  const a2 = Math.acos(clamp11((d - x) / r2));
  return r1 * r1 * a1 + r2 * r2 * a2 - d * y;
}

function safeBodyRadius(body: StarBodyV4 | PlanetBodyV4 | MoonBodyV4): number {
  const r0 = finitePositiveOrDefault(body.r, 1);
  const obl = finiteOrDefault(body.shape?.oblateness, 0);
  if (!(obl > 0)) return r0;
  const f = Math.max(0.1, 1 - 0.5 * Math.min(0.9, obl));
  return r0 * f;
}

// TODO: The velocity here is computed via central finite differences (3 Kepler
// solves).  An analytical velocity from the vis-viva equation and the orbital
// state vector would eliminate 2 of the 3 solves and improve both accuracy and
// performance.
export function orbitStateAt(
  el: { a: number; e: number; inc: number; Omega: number; omega: number; period: number; t0: number },
  t: number,
): {
  r: Vec3;
  v: Vec3;
} {
  const dt = Math.max(0.01, el.period * 1e-4);
  const r = posFromResolvedElements(el, t, "v4.orbit");
  const rp = posFromResolvedElements(el, t + dt, "v4.orbit");
  const rm = posFromResolvedElements(el, t - dt, "v4.orbit");
  return {
    r,
    v: vScale(vSub(rp, rm), 1 / (2 * dt)),
  };
}

function hierarchyParentMap(config: SimulationConfigV4): Map<string, string> {
  const out = new Map<string, string>();
  for (const link of config.orbits.hierarchy ?? []) {
    if (link.childId && link.parentId) out.set(link.childId, link.parentId);
  }
  return out;
}

export function buildNativeSnapshot(config: SimulationConfigV4, tObsSec: number): NativeSnapshot {
  const observerDir = normalizeObserverDir(config);
  const byId = new Map<string, NativeBodyState>();
  const stars: NativeBodyState[] = [];
  const planets: NativeBodyState[] = [];
  const moons: NativeBodyState[] = [];
  const hmap = hierarchyParentMap(config);

  const [starA, starB] = config.bodies.stars;
  const binary = orbitStateAt(config.orbits.binary, tObsSec);
  const mA = finiteOrDefault(starA.m, 0);
  const mB = finiteOrDefault(starB.m, 0);
  const mTot = mA > 0 && mB > 0 ? mA + mB : 0;
  const wA = mTot > 0 ? -mB / mTot : 0;
  const wB = mTot > 0 ? mA / mTot : 1;

  const lumA = Math.max(0, finiteOrDefault(starA.luminosityScale, 1));
  // Only default to 0.3 luminosity if explicitly in binary lab mode AND the
  // user has not set luminosityScale themselves. Never assign luminosity blindly.
  const lumBDefault =
    config.mode === "detached-binary-lab" ? (starB.luminosityScale !== undefined ? 0 : 0.3) : 0;
  const lumBraw = Math.max(0, finiteOrDefault(starB.luminosityScale, lumBDefault));
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
        throw new Error(`buildNativeSnapshot: moon "${bodyId}" is missing a parent planet reference.`);
      }
      return undefined;
    }
    const parent = byId.get(parentId);
    if (!parent) {
      throw new Error(`buildNativeSnapshot: unknown parent "${parentId}" for ${bodyKind} "${bodyId}".`);
    }
    return parent;
  };

  for (const p of config.bodies.planets) {
    const rel = orbitStateAt(p.orbit, tObsSec);
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
    const rel = orbitStateAt(m.orbit, tObsSec);
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

function atmosphereOpacityForOcculter(config: SimulationConfigV4, body: NativeBodyState): number {
  const rt = config.photometry?.atmosphereRT;
  if (!rt?.enabled || !Array.isArray(rt.layers) || rt.layers.length === 0) return 1;
  const target = body.kind === "moon" ? "moon" : body.kind === "planet" ? "planet" : undefined;
  if (!target || rt.target !== target) return 1;
  const rho = body.r * 1.01;
  const tr = totalAtmosphereTransmission({
    rho,
    config: {
      ...rt,
      layers: rt.layers,
    },
  });
  return clamp01(1 - tr);
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
    const areaStar = Math.PI * st.r * st.r;
    let blocked = 0;
    let blockedByStars = 0;
    const occulters: NativeBodyState[] = [
      ...nonStars,
      ...luminousStars.filter((o) => o.id !== st.id && o.sky.z > st.sky.z),
    ];
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

  const total = stellarPreTransit + additivePlanetary + additiveLunar;
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
  const firstPlanet = snap.planets[0];
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
    // Known limitation: forward scattering and ring scattering are not yet
    // implemented in V4 native model. They are always zero.
    // TODO: Port forwardScattering and ringScattering from V3 pipeline.
    forwardScattering: 0,
    ringScattering: 0,
    stellarVariability,
    total,
    nOcculters,
    planetVisibleFraction,
    moonVisibleFraction,
  };
}
