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

import type { OrbitElements, OrbitElementsProvider, SystemParams } from "../core/types";
import { toFinitePositiveOr } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { sampleMoonOrbitSkyAbsolute, sampleOrbitSky } from "../sim/sim";

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

function orbitElementsKey(el: OrbitElements): string {
  // Includes all geometry + phase relevant fields.
  // Quantize for stable string keys (cache only).
  const q = (v: number) => (Number.isFinite(v) ? v.toFixed(12) : "NaN");
  return [el.a, el.e, el.inc, el.Omega, el.omega, el.period, el.t0].map(q).join("|");
}

function observerDirKey(dir: Vec3, decimals: number): string {
  const d = clampInt(decimals, 0, 12);
  const q = (v: number) => (Number.isFinite(v) ? v.toFixed(d) : "NaN");
  return `${q(dir.x)}|${q(dir.y)}|${q(dir.z)}`;
}

function closePathIfRequested(pts: OrbitPathPoint2D[], close: boolean): OrbitPathPoint2D[] {
  if (!close) return pts;
  if (pts.length === 0) return pts;

  const first = pts[0];
  const last = pts[pts.length - 1];

  // Avoid duplicating if a caller ever provides already-closed data.
  if (first.x === last.x && first.y === last.y) return pts;

  const out = new Array<OrbitPathPoint2D>(pts.length + 1);
  for (let i = 0; i < pts.length; i++) out[i] = pts[i];
  out[pts.length] = { x: first.x, y: first.y };
  return out;
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
    closePath?: boolean
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
      `closed:${close ? 1 : 0}`,
    ].join("|");

    if (this.cachedPlanet?.key === key) return this.cachedPlanet.pts;

    // Use simulation helper; it may return (x,y,z). We store only (x,y).
    const pts3 = sampleOrbitSky(params.planet.orbit, t, N, observerDir);
    const pts2Base: OrbitPathPoint2D[] = new Array(pts3.length);
    for (let i = 0; i < pts3.length; i++) pts2Base[i] = { x: pts3[i].x, y: pts3[i].y };

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
    closePath?: boolean
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
      `closed:${close ? 1 : 0}`,
    ].join("|");

    if (this.cachedMoon?.key === key) return this.cachedMoon.pts;

    // Ensure the moon sampling uses the same observerDir that the cache key is based on.
    // This is render-only; it does not affect the simulation stepper.
    const paramsForSampling: SystemParams = params.observer
      ? { ...params, observer: { ...params.observer, dir: observerDir } }
      : { ...params, observer: { dir: observerDir } };

    const pts3 = sampleMoonOrbitSkyAbsolute(paramsForSampling, t, N);
    const pts2Base: OrbitPathPoint2D[] = new Array(pts3.length);
    for (let i = 0; i < pts3.length; i++) pts2Base[i] = { x: pts3[i].x, y: pts3[i].y };

    const pts2 = closePathIfRequested(pts2Base, close);

    this.cachedMoon = { key, pts: pts2 };
    return pts2;
  }
}
