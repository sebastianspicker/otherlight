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

type OrbitElementsKeyEntry = {
  a: number;
  e: number;
  inc: number;
  Omega: number;
  omega: number;
  period: number;
  t0: number;
  key: string;
};

type ObserverDirKeyEntry = {
  x: number;
  y: number;
  z: number;
  decimals: number;
  key: string;
};

function clampInt(n: number, lo: number, hi: number): number {
  const nn = Math.floor(n);
  return Math.max(lo, Math.min(hi, nn));
}

/**
 * Mix a float value into a 32-bit hash seed using xorshift-style bit mixing.
 * Quantizes to a stable integer at ~9 decimal places of precision, which is
 * more than sufficient for orbit-path cache discrimination.
 */
function mixFloat(seed: number, v: number): number {
  const bits = Number.isFinite(v) ? Math.round(v * 1e9) | 0 : 0x7fffffff;
  let h = Math.imul(seed ^ bits, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return h ^ (h >>> 16);
}

/**
 * Compute a compact, collision-resistant string key for an OrbitElements object.
 * Uses two independent 32-bit hashes (64-bit combined) with Math.imul bit mixing.
 * Much cheaper than the previous toFixed(12).join('|') approach:
 * - 7 multiply+mix operations instead of 7 toFixed(12) calls and a string join.
 * - Output is a ~22-char "h1:h2" string instead of ~100-char toFixed string.
 */
function hashOrbitElements(el: OrbitElements): string {
  let h1 = 0x9e3779b9;
  let h2 = 0x6c62272e;
  h1 = mixFloat(h1, el.a);
  h1 = mixFloat(h1, el.e);
  h1 = mixFloat(h1, el.inc);
  h1 = mixFloat(h1, el.Omega);
  h2 = mixFloat(h2, el.omega);
  h2 = mixFloat(h2, el.period);
  h2 = mixFloat(h2, el.t0);
  return `${h1 >>> 0}:${h2 >>> 0}`;
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

const orbitElementsKeyCache = new WeakMap<OrbitElements, OrbitElementsKeyEntry>();
let observerDirKeyCache: ObserverDirKeyEntry | undefined;

function orbitElementsKey(el: OrbitElements): string {
  const cached = orbitElementsKeyCache.get(el);
  if (
    cached &&
    cached.a === el.a &&
    cached.e === el.e &&
    cached.inc === el.inc &&
    cached.Omega === el.Omega &&
    cached.omega === el.omega &&
    cached.period === el.period &&
    cached.t0 === el.t0
  ) {
    return cached.key;
  }

  // Compute a compact numeric hash key for this orbit configuration.
  // hashOrbitElements uses Math.imul bit-mixing — much cheaper than
  // toFixed(12).join('|') for the cache-miss path.
  const key = hashOrbitElements(el);
  orbitElementsKeyCache.set(el, {
    a: el.a,
    e: el.e,
    inc: el.inc,
    Omega: el.Omega,
    omega: el.omega,
    period: el.period,
    t0: el.t0,
    key,
  });
  return key;
}

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
    const N = clampInt(samples ?? this.opts.defaultPlanetSamples, 32, 4096);
    const close = closePath ?? this.opts.closePlanetPath;

    // Determine quantized phase bin for caching.
    const elNow = orbitElementsAt(params.planet.orbit, t);
    const period = toFinitePositiveOr(elNow.period, 1);
    const bins = clampInt(this.opts.phaseBinsPerOrbit, 8, 2000);

    const phase01 = normalizePhase01(t, Number.isFinite(elNow.t0) ? elNow.t0 : 0, period);
    const phaseBin = clampInt(Math.floor(phase01 * bins), 0, bins - 1);

    const key = [
      "planet",
      `obs:${observerDirKey(observerDir, this.opts.observerDirDecimals)}`,
      `orbit:${orbitProviderIdPart(params.planet.orbit, this.providerIds)}`,
      `el:${orbitElementsKey(elNow)}`,
      `bin:${phaseBin}/${bins}`,
      `N:${N}`,
      `nbody:${nbodyConfigKey(params, this.providerIds, t)}`,
      `closed:${close ? 1 : 0}`,
    ].join("|");

    if (this.cachedPlanet?.key === key) return this.cachedPlanet.pts;

    const nbodyOn = isNBodyEnabled(params);
    let pts2Base: OrbitPathPoint2D[] | null = null;

    if (nbodyOn) {
      try {
        const includeEndpoint = false;
        const denom = includeEndpoint ? Math.max(1, N - 1) : N;
        const pts: OrbitPathPoint2D[] = new Array(N);
        let failedAt = -1;
        for (let i = 0; i < N; i++) {
          const tt = t + (i / denom) * period;
          const nb = getNBodyStateAt(params, tt);
          if (!nb) {
            failedAt = i;
            break;
          }
          const sky = projectToSky(vSub(nb.state.rP, nb.state.rS), observerDir);
          pts[i] = { x: sky.x, y: sky.y };
        }
        if (failedAt < 0) {
          // All points sampled successfully via N-body.
          pts2Base = pts;
        } else if (failedAt > 0) {
          // Partial N-body success: fill remaining points with Keplerian fallback.
          const fallback3 = sampleOrbitSky(params.planet.orbit, t, N, observerDir);
          for (let i = failedAt; i < N; i++) {
            pts[i] = { x: fallback3[i].x, y: fallback3[i].y };
          }
          pts2Base = pts;
        }
        // If failedAt === 0, no N-body points at all; fall through to full Keplerian below.
      } catch {
        // Render path is non-critical; fallback to Kepler guide path if n-body state cannot be sampled.
      }
    }

    if (!pts2Base) {
      // Use simulation helper; it may return (x,y,z). We store only (x,y).
      const pts3 = sampleOrbitSky(params.planet.orbit, t, N, observerDir);
      pts2Base = new Array(pts3.length);
      for (let i = 0; i < pts3.length; i++) pts2Base[i] = { x: pts3[i].x, y: pts3[i].y };
    }

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

    const N = clampInt(samples ?? this.opts.defaultMoonSamples, 32, 4096);
    const close = closePath ?? this.opts.closeMoonPath;

    // Use moon period (and its t0) as primary phase, but include planet orbit signature too
    // because sampleMoonOrbitSkyAbsolute uses the planet barycentric orbit to place the moon.
    const pEl = orbitElementsAt(params.planet.orbit, t);
    const mEl = orbitElementsAt(params.moon.orbitAroundPlanet, t);

    const moonPeriod = toFinitePositiveOr(mEl.period, toFinitePositiveOr(pEl.period, 1));
    const bins = clampInt(this.opts.phaseBinsPerOrbit, 8, 2000);

    const phase01 = normalizePhase01(t, Number.isFinite(mEl.t0) ? mEl.t0 : 0, moonPeriod);
    const phaseBin = clampInt(Math.floor(phase01 * bins), 0, bins - 1);

    const key = [
      "moonAbs",
      `obs:${observerDirKey(observerDir, this.opts.observerDirDecimals)}`,
      `planetOrbit:${orbitProviderIdPart(params.planet.orbit, this.providerIds)}`,
      `moonOrbit:${orbitProviderIdPart(params.moon.orbitAroundPlanet, this.providerIds)}`,
      `pEl:${orbitElementsKey(pEl)}`,
      `mEl:${orbitElementsKey(mEl)}`,
      `bin:${phaseBin}/${bins}`,
      `N:${N}`,
      `nbody:${nbodyConfigKey(params, this.providerIds, t)}`,
      `closed:${close ? 1 : 0}`,
    ].join("|");

    if (this.cachedMoon?.key === key) return this.cachedMoon.pts;

    const nbodyOn = isNBodyEnabled(params);
    let pts2Base: OrbitPathPoint2D[] | null = null;
    if (nbodyOn) {
      try {
        const includeEndpoint = false;
        const denom = includeEndpoint ? Math.max(1, N - 1) : N;
        const pts: OrbitPathPoint2D[] = new Array(N);
        let failedAt = -1;
        for (let i = 0; i < N; i++) {
          const tt = t + (i / denom) * moonPeriod;
          const nb = getNBodyStateAt(params, tt);
          if (!nb) {
            failedAt = i;
            break;
          }
          const sky = projectToSky(vSub(nb.state.rM, nb.state.rS), observerDir);
          pts[i] = { x: sky.x, y: sky.y };
        }
        if (failedAt < 0) {
          // All points sampled successfully via N-body.
          pts2Base = pts;
        } else if (failedAt > 0) {
          // Partial N-body success: fill remaining points with Keplerian fallback.
          const paramsForFallback: SystemParams = params.observer
            ? { ...params, observer: { ...params.observer, dir: observerDir } }
            : { ...params, observer: { dir: observerDir } };
          const fallback3 = sampleMoonOrbitSkyAbsolute(paramsForFallback, t, N);
          for (let i = failedAt; i < N; i++) {
            pts[i] = { x: fallback3[i].x, y: fallback3[i].y };
          }
          pts2Base = pts;
        }
        // If failedAt === 0, no N-body points at all; fall through to full Keplerian below.
      } catch {
        // Render path is non-critical; fallback to Kepler guide path if n-body state cannot be sampled.
      }
    }

    if (!pts2Base) {
      // Ensure the moon sampling uses the same observerDir that the cache key is based on.
      // This is render-only; it does not affect the simulation stepper.
      const paramsForSampling: SystemParams = params.observer
        ? { ...params, observer: { ...params.observer, dir: observerDir } }
        : { ...params, observer: { dir: observerDir } };

      const pts3 = sampleMoonOrbitSkyAbsolute(paramsForSampling, t, N);
      pts2Base = new Array(pts3.length);
      for (let i = 0; i < pts3.length; i++) pts2Base[i] = { x: pts3[i].x, y: pts3[i].y };
    }

    const pts2 = closePathIfRequested(pts2Base, close);

    this.cachedMoon = { key, pts: pts2 };
    return pts2;
  }
}
