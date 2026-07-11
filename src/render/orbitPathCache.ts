// src/render/orbitPathCache.ts
//
// Orbit path caching for the Canvas2D renderer.
//
// Goals:
// - Avoid re-sampling expensive orbit paths every frame if inputs haven't changed.
// - Remain scientifically consistent by delegating sampling to simulation helpers
//   (sampleOrbitSky, sampleMoonOrbitSkyAbsolute), i.e. no duplicated orbital mechanics.
//
// Notes / scientific intent:
// - These paths are visual guides only. They MUST NOT affect simulation state, dynamics, or photometry.
// - The cache key intentionally quantizes (a) orbital phase and (b) observerDir to avoid re-sampling on
//   tiny UI jitter. This is a rendering optimization, not a physics concept.
// - Closed-curve rendering (optionally appending the first point at the end) is implemented here on
//   purpose so no simulation/test code accidentally depends on "closed sampling".

import type { NBodyPerturberParams, OrbitElements, OrbitElementsProvider, SystemParams } from "../core/types";
import { toFinitePositiveOr } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { vSub } from "../physics/vec3";
import { projectToSky } from "../physics/frames";
import { sampleMoonOrbitSkyAbsolute, sampleOrbitSky } from "../sim/sim";
import { getNBodyStateAt, isNBodyEnabled } from "../sim/dynamics";
import { orbitElementsKey } from "./orbitElementsKey";

export type OrbitPathPoint2D = { x: number; y: number };

export type OrbitPathCacheOptions = {
  /**
   * Number of phase bins per orbit used to quantize time for caching.
   * Example: 180 ~ 2° increments.
   */
  phaseBinsPerOrbit?: number;

  /**
   * Quantization decimals for observerDir components in the cache key.
   * Higher => fewer cache hits from tiny jitter; lower => more stable caching.
   */
  observerDirDecimals?: number;

  /**
   * Default sampling resolution for the planet orbit path.
   * (You can still override per call.)
   */
  defaultPlanetSamples?: number;

  /**
   * Default sampling resolution for the moon absolute orbit path.
   * (You can still override per call.)
   */
  defaultMoonSamples?: number;

  /**
   * If true, returned planet paths are "closed" by appending the first point at the end.
   * This is purely for rendering (closed polyline), not physics.
   *
   * Default: false.
   */
  closePlanetPath?: boolean;

  /**
   * If true, returned moon paths are "closed" by appending the first point at the end.
   * This is purely for rendering (closed polyline), not physics.
   *
   * Default: false.
   */
  closeMoonPath?: boolean;
};

type CachedPath = {
  key: string;
  pts: OrbitPathPoint2D[];
};

type ObserverDirKeyEntry = {
  x: number;
  y: number;
  z: number;
  decimals: number;
  key: string;
};

type NBodySnapshot = NonNullable<ReturnType<typeof getNBodyStateAt>>;
type NBodyVectorSelector = (snapshot: NBodySnapshot) => Vec3;
type OrbitPathSampling = { sampleCount: number; close: boolean };

function clampInt(n: number, lo: number, hi: number): number {
  const nn = Math.floor(n);
  return Math.max(lo, Math.min(hi, nn));
}

function normalizePhase01(t: number, t0: number, period: number): number {
  // Robust periodic mapping into [0,1).
  const P = toFinitePositiveOr(period, 1);
  const x = (t - t0) / P;

  // JS modulo for negatives is negative -> fix into [0,1)
  const frac = x - Math.floor(x);
  return frac;
}

function orbitElementsAt(orbit: OrbitElements | OrbitElementsProvider, t: number): OrbitElements {
  return typeof orbit === "function" ? orbit(t) : orbit;
}

let observerDirKeyCache: ObserverDirKeyEntry | undefined;

function observerDirKey(dir: Vec3, decimals: number): string {
  const cached = observerDirKeyCache;
  if (
    cached &&
    cached.x === dir.x &&
    cached.y === dir.y &&
    cached.z === dir.z &&
    cached.decimals === decimals
  ) {
    return cached.key;
  }
  const d = clampInt(decimals, 0, 12);
  const q = (v: number) => (Number.isFinite(v) ? v.toFixed(d) : "NaN");
  const key = `${q(dir.x)}|${q(dir.y)}|${q(dir.z)}`;
  observerDirKeyCache = {
    x: dir.x,
    y: dir.y,
    z: dir.z,
    decimals,
    key,
  };
  return key;
}

function closePathIfRequested(pts: OrbitPathPoint2D[], close: boolean): OrbitPathPoint2D[] {
  if (!close) return pts;
  if (pts.length === 0) return pts;

  const first = pts[0];
  const last = pts[pts.length - 1];

  // Avoid duplicating if a caller ever provides already-closed data.
  if (first.x === last.x && first.y === last.y) return pts;

  return [...pts, { x: first.x, y: first.y }];
}

class ProviderIdRegistry {
  private nextId = 1;
  private ids = new WeakMap<OrbitElementsProvider, number>();

  getId(fn: OrbitElementsProvider): number {
    const existing = this.ids.get(fn);
    if (existing) return existing;

    const id = this.nextId++;
    this.ids.set(fn, id);
    return id;
  }
}

function orbitProviderIdPart(orbit: OrbitElements | OrbitElementsProvider, reg: ProviderIdRegistry): string {
  if (typeof orbit === "function") return `fn:${reg.getId(orbit)}`;
  return "const";
}

function finiteKey(v: unknown): string {
  return Number.isFinite(v) ? (v as number).toFixed(12) : "NaN";
}

function nbodyOrbitKey(
  orbit: OrbitElements | OrbitElementsProvider | undefined,
  reg: ProviderIdRegistry,
  t: number,
): string {
  if (!orbit) return "none";
  if (typeof orbit === "function") return `fn:${reg.getId(orbit)}`;
  return `el:${orbitElementsKey(orbitElementsAt(orbit, t))}`;
}

function nbodyMuSourceKey(args: { mu?: number; cfgMass?: number; bodyMass?: number }): string {
  if (Number.isFinite(args.mu) && (args.mu as number) > 0) return `mu:${finiteKey(args.mu)}`;
  if (Number.isFinite(args.cfgMass) && (args.cfgMass as number) > 0) return `mCfg:${finiteKey(args.cfgMass)}`;
  if (Number.isFinite(args.bodyMass) && (args.bodyMass as number) > 0)
    return `mBody:${finiteKey(args.bodyMass)}`;
  return "none";
}

function nbodyConfigKey(params: SystemParams, reg: ProviderIdRegistry, t: number): string {
  const nbody = params.dynamics?.nbodyPlanetMoon;
  if (!nbody?.enabled) return "off";

  const muStar = nbodyMuSourceKey({ mu: nbody.muStar, cfgMass: nbody.mStar, bodyMass: params.star?.m });
  const muPlanet = nbodyMuSourceKey({
    mu: nbody.muPlanet,
    cfgMass: nbody.mPlanet,
    bodyMass: params.planet?.m,
  });
  const muMoon = nbodyMuSourceKey({ mu: nbody.muMoon, cfgMass: nbody.mMoon, bodyMass: params.moon?.m });

  const pert = Array.isArray(nbody.perturbers) ? (nbody.perturbers as NBodyPerturberParams[]) : [];
  const pertKey = pert
    .map((p, i) => {
      if (!p || p.enabled === false) return `${i}:off`;
      return [
        `${i}:on`,
        `mu:${finiteKey(p.mu)}`,
        `m:${finiteKey(p.m)}`,
        `orbit:${nbodyOrbitKey(p.orbit, reg, t)}`,
      ].join(",");
    })
    .join(";");

  const rel = params.dynamics?.relativity;
  return [
    "on",
    `muS:${muStar}`,
    `muP:${muPlanet}`,
    `muM:${muMoon}`,
    `dt:${finiteKey(nbody.dtMax)}`,
    `soft:${finiteKey(nbody.softening)}`,
    `overlap:${nbody.throwOnOverlap ? 1 : 0}`,
    `relOn:${rel?.enabled ? 1 : 0}`,
    `relGr:${rel?.grPrecession === false ? 0 : 1}`,
    `relC:${finiteKey(rel?.c)}`,
    `pert:${pertKey}`,
  ].join("|");
}

function phaseBinForTime(t: number, t0: number, period: number, bins: number): number {
  const phase01 = normalizePhase01(t, Number.isFinite(t0) ? t0 : 0, period);
  return clampInt(Math.floor(phase01 * bins), 0, bins - 1);
}

function projectedPathPoint(
  snapshot: NBodySnapshot,
  observerDir: Vec3,
  selectVector: NBodyVectorSelector,
): OrbitPathPoint2D {
  const sky = projectToSky(selectVector(snapshot), observerDir);
  return { x: sky.x, y: sky.y };
}

function sampleNBodyPath(args: {
  params: SystemParams;
  t: number;
  period: number;
  sampleCount: number;
  observerDir: Vec3;
  selectVector: NBodyVectorSelector;
  fillFallback: (pts: OrbitPathPoint2D[], failedAt: number) => void;
}): OrbitPathPoint2D[] | null {
  if (!isNBodyEnabled(args.params)) return null;

  try {
    const pts: OrbitPathPoint2D[] = new Array(args.sampleCount);
    const failedAt = fillNBodySamples(args, pts);
    if (failedAt < 0) return pts;
    if (failedAt > 0) {
      args.fillFallback(pts, failedAt);
      return pts;
    }
  } catch {
    // Render path is non-critical; fallback to Kepler guide path if n-body state cannot be sampled.
  }
  return null;
}

function fillNBodySamples(
  args: {
    params: SystemParams;
    t: number;
    period: number;
    sampleCount: number;
    observerDir: Vec3;
    selectVector: NBodyVectorSelector;
  },
  pts: OrbitPathPoint2D[],
): number {
  for (let i = 0; i < args.sampleCount; i++) {
    const nb = getNBodyStateAt(args.params, args.t + (i / args.sampleCount) * args.period);
    if (!nb) return i;
    pts[i] = projectedPathPoint(nb, args.observerDir, args.selectVector);
  }
  return -1;
}

function planetNBodyVector(snapshot: NBodySnapshot): Vec3 {
  return vSub(snapshot.state.rP, snapshot.state.rS);
}

function moonNBodyVector(snapshot: NBodySnapshot): Vec3 {
  return vSub(snapshot.state.rM, snapshot.state.rS);
}

function toPath2D(pts: Array<{ x: number; y: number }>): OrbitPathPoint2D[] {
  const pts2 = new Array<OrbitPathPoint2D>(pts.length);
  for (let i = 0; i < pts.length; i++) pts2[i] = { x: pts[i].x, y: pts[i].y };
  return pts2;
}

function paramsWithObserverDir(params: SystemParams, observerDir: Vec3): SystemParams {
  return params.observer
    ? { ...params, observer: { ...params.observer, dir: observerDir } }
    : { ...params, observer: { dir: observerDir } };
}

function samplePlanetKeplerPath(
  params: SystemParams,
  t: number,
  sampleCount: number,
  observerDir: Vec3,
): OrbitPathPoint2D[] {
  return toPath2D(sampleOrbitSky(params.planet.orbit, t, sampleCount, observerDir));
}

function sampleMoonKeplerPath(
  params: SystemParams,
  t: number,
  sampleCount: number,
  observerDir: Vec3,
): OrbitPathPoint2D[] {
  return toPath2D(sampleMoonOrbitSkyAbsolute(paramsWithObserverDir(params, observerDir), t, sampleCount));
}

function buildPlanetPathKey(args: {
  params: SystemParams;
  t: number;
  observerDir: Vec3;
  sampleCount: number;
  close: boolean;
  elNow: OrbitElements;
  phaseBin: number;
  bins: number;
  providerIds: ProviderIdRegistry;
  observerDirDecimals: number;
}): string {
  return [
    "planet",
    `obs:${observerDirKey(args.observerDir, args.observerDirDecimals)}`,
    `orbit:${orbitProviderIdPart(args.params.planet.orbit, args.providerIds)}`,
    `el:${orbitElementsKey(args.elNow)}`,
    `bin:${args.phaseBin}/${args.bins}`,
    `N:${args.sampleCount}`,
    `nbody:${nbodyConfigKey(args.params, args.providerIds, args.t)}`,
    `closed:${args.close ? 1 : 0}`,
  ].join("|");
}

function buildMoonPathKey(args: {
  params: SystemParams;
  t: number;
  observerDir: Vec3;
  sampleCount: number;
  close: boolean;
  pEl: OrbitElements;
  mEl: OrbitElements;
  phaseBin: number;
  bins: number;
  providerIds: ProviderIdRegistry;
  observerDirDecimals: number;
}): string {
  const moon = args.params.moon;
  if (!moon) return "moonAbs|absent";
  return [
    "moonAbs",
    `obs:${observerDirKey(args.observerDir, args.observerDirDecimals)}`,
    `planetOrbit:${orbitProviderIdPart(args.params.planet.orbit, args.providerIds)}`,
    `moonOrbit:${orbitProviderIdPart(moon.orbitAroundPlanet, args.providerIds)}`,
    `pEl:${orbitElementsKey(args.pEl)}`,
    `mEl:${orbitElementsKey(args.mEl)}`,
    `bin:${args.phaseBin}/${args.bins}`,
    `N:${args.sampleCount}`,
    `nbody:${nbodyConfigKey(args.params, args.providerIds, args.t)}`,
    `closed:${args.close ? 1 : 0}`,
  ].join("|");
}

function resolveOrbitPathSampling(
  samples: number | undefined,
  defaultSamples: number,
  closePath: boolean | undefined,
  defaultClose: boolean,
): OrbitPathSampling {
  return {
    sampleCount: clampInt(valueOrDefault(samples, defaultSamples), 32, 4096),
    close: valueOrDefault(closePath, defaultClose),
  };
}

function valueOrDefault<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback;
}

export class OrbitPathCache {
  private opts: Required<OrbitPathCacheOptions>;
  private cachedPlanet?: CachedPath;
  private cachedMoon?: CachedPath;

  private providerIds = new ProviderIdRegistry();

  constructor(opts: OrbitPathCacheOptions = {}) {
    this.opts = {
      phaseBinsPerOrbit: toFinitePositiveOr(opts.phaseBinsPerOrbit, 180),
      observerDirDecimals: clampInt(opts.observerDirDecimals ?? 6, 0, 12),
      defaultPlanetSamples: clampInt(opts.defaultPlanetSamples ?? 360, 32, 4096),
      defaultMoonSamples: clampInt(opts.defaultMoonSamples ?? 240, 32, 4096),
      closePlanetPath: Boolean(opts.closePlanetPath),
      closeMoonPath: Boolean(opts.closeMoonPath),
    };
  }

  clear(): void {
    this.cachedPlanet = undefined;
    this.cachedMoon = undefined;
  }

  /**
   * Returns a cached planet orbit path projected into the sky plane (2D x/y points).
   *
   * Visual guide only:
   * - The returned points are for rendering overlays (orbit traces), not for photometry or dynamics.
   * - Sampling is delegated to sim.ts helpers to avoid duplicating orbital mechanics here.
   */
  getPlanetPath(
    params: SystemParams,
    t: number,
    observerDir: Vec3,
    samples?: number,
    closePath?: boolean,
  ): OrbitPathPoint2D[] {
    const { sampleCount, close } = resolveOrbitPathSampling(
      samples,
      this.opts.defaultPlanetSamples,
      closePath,
      this.opts.closePlanetPath,
    );
    const elNow = orbitElementsAt(params.planet.orbit, t);
    const period = toFinitePositiveOr(elNow.period, 1);
    const bins = clampInt(this.opts.phaseBinsPerOrbit, 8, 2000);
    const phaseBin = phaseBinForTime(t, elNow.t0, period, bins);

    const key = buildPlanetPathKey({
      params,
      t,
      observerDir,
      sampleCount,
      close,
      elNow,
      phaseBin,
      bins,
      providerIds: this.providerIds,
      observerDirDecimals: this.opts.observerDirDecimals,
    });

    if (this.cachedPlanet?.key === key) return this.cachedPlanet.pts;

    const pts2Base =
      sampleNBodyPath({
        params,
        t,
        period,
        sampleCount,
        observerDir,
        selectVector: planetNBodyVector,
        fillFallback: (pts, failedAt) => {
          const fallback = samplePlanetKeplerPath(params, t, sampleCount, observerDir);
          for (let i = failedAt; i < sampleCount; i++) pts[i] = fallback[i];
        },
      }) ?? samplePlanetKeplerPath(params, t, sampleCount, observerDir);
    const pts2 = closePathIfRequested(pts2Base, close);

    this.cachedPlanet = { key, pts: pts2 };
    return pts2;
  }

  /**
   * Returns a cached moon absolute orbit path projected into the sky plane (2D x/y points).
   * If params.moon is absent, returns an empty array.
   *
   * Visual guide only:
   * - The returned points are for rendering overlays (orbit traces), not for photometry or dynamics.
   * - Sampling is delegated to sim.ts helpers to avoid duplicating orbital mechanics here.
   */
  getMoonPath(
    params: SystemParams,
    t: number,
    observerDir: Vec3,
    samples?: number,
    closePath?: boolean,
  ): OrbitPathPoint2D[] {
    if (!params.moon) return [];

    const { sampleCount, close } = resolveOrbitPathSampling(
      samples,
      this.opts.defaultMoonSamples,
      closePath,
      this.opts.closeMoonPath,
    );
    const pEl = orbitElementsAt(params.planet.orbit, t);
    const mEl = orbitElementsAt(params.moon.orbitAroundPlanet, t);
    const moonPeriod = toFinitePositiveOr(mEl.period, toFinitePositiveOr(pEl.period, 1));
    const bins = clampInt(this.opts.phaseBinsPerOrbit, 8, 2000);
    const phaseBin = phaseBinForTime(t, mEl.t0, moonPeriod, bins);

    const key = buildMoonPathKey({
      params,
      t,
      observerDir,
      sampleCount,
      close,
      pEl,
      mEl,
      phaseBin,
      bins,
      providerIds: this.providerIds,
      observerDirDecimals: this.opts.observerDirDecimals,
    });

    if (this.cachedMoon?.key === key) return this.cachedMoon.pts;

    const pts2Base =
      sampleNBodyPath({
        params,
        t,
        period: moonPeriod,
        sampleCount,
        observerDir,
        selectVector: moonNBodyVector,
        fillFallback: (pts, failedAt) => {
          const fallback = sampleMoonKeplerPath(params, t, sampleCount, observerDir);
          for (let i = failedAt; i < sampleCount; i++) pts[i] = fallback[i];
        },
      }) ?? sampleMoonKeplerPath(params, t, sampleCount, observerDir);
    const pts2 = closePathIfRequested(pts2Base, close);

    this.cachedMoon = { key, pts: pts2 };
    return pts2;
  }
}
