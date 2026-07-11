// src/sim/sampling.ts
//
// Orbit sampling helpers for visualization (sky-plane paths).
//
// Conventions (project-wide):
// - Time in seconds, angles in radians, lengths in meters (SI).
// - `observer.dir` points from the star toward the observer.
// - `projectToSky(r, observerDir)` projects inertial position r into sky plane coordinates.

import type { OrbitElements, OrbitElementsProvider, SystemParams } from "../core/types";
import type { Vec3 } from "../physics/vec3";
import { vNormalizeOrThrow } from "../physics/vec3";
import { projectToSky } from "../physics/frames";
import { toFiniteNumber } from "../core/units";
import { getObserverDir } from "./observerContract";
import { posFromElements, resolveOrbitElements } from "./orbits";
import { getMoonStateAt } from "./kinematics";

export type OrbitSampleOptions = {
  /**
   * If true, include the endpoint at phase 1 (tStart + period) as the last sample.
   * Default false to avoid duplicating the start point in closed orbit rendering.
   */
  includeEndpoint?: boolean;
};

type SkySample = { x: number; y: number; z: number };
type MoonParams = NonNullable<SystemParams["moon"]>;
type MoonSampleContext = {
  params: SystemParams;
  tStart: number;
  samples: number;
  denom: number;
  moonPeriod: number;
  observerDir: Vec3;
};

export function sampleOrbitSky(
  elOrProvider: OrbitElements | OrbitElementsProvider,
  tStart: number,
  samples = 256,
  observerDir?: Vec3,
  opts: OrbitSampleOptions = {},
): SkySample[] {
  assertFiniteSampleStart(tStart, "sampleOrbitSky");

  const N = resolveSampleCount(samples);

  const dirRaw = observerDir ?? { x: 0, y: 0, z: 1 };
  const dir = vNormalizeOrThrow(dirRaw, 1e-15, "sampleOrbitSky: observerDir must be non-zero.");

  // Use the period at tStart as the sampling span (stable for rendering even if a provider varies slowly).
  const el0 = resolveOrbitElements(elOrProvider, tStart, "orbit");
  const period0 = assertPositiveSamplePeriod(el0.period, "sampleOrbitSky: orbit.period must be > 0.");
  const denom = resolveSampleDenominator(N, opts);

  const pts: SkySample[] = [];
  for (let i = 0; i < N; i++) {
    const tt = sampleTime(tStart, i, denom, period0);
    const r = posFromElements(elOrProvider, tt, "orbit");
    pts.push(projectToSky(r, dir));
  }

  return pts;
}

export function sampleMoonOrbitSkyAbsolute(
  params: SystemParams,
  tStart: number,
  samples = 256,
  opts: OrbitSampleOptions = {},
): SkySample[] {
  if (!params.moon) return [];
  assertFiniteSampleStart(tStart, "sampleMoonOrbitSkyAbsolute");

  const observerDir = getObserverDir(params);
  const N = resolveSampleCount(samples);
  const moonPeriod = resolveMoonSamplePeriod(params.moon, tStart);
  const denom = resolveSampleDenominator(N, opts);

  return collectMoonSkySamples({
    params,
    tStart,
    samples: N,
    denom,
    moonPeriod,
    observerDir,
  });
}

function assertFiniteSampleStart(tStart: number, label: string): void {
  if (!Number.isFinite(tStart)) throw new Error(`${label}: tStart must be finite.`);
}

function resolveSampleCount(samples: number): number {
  return Math.max(16, Math.floor(toFiniteNumber(samples, 256)));
}

function assertPositiveSamplePeriod(period: number, message: string): number {
  if (!Number.isFinite(period) || period <= 0) throw new Error(message);
  return period;
}

function resolveSampleDenominator(samples: number, opts: OrbitSampleOptions): number {
  return opts.includeEndpoint ? Math.max(1, samples - 1) : samples;
}

function sampleTime(tStart: number, index: number, denom: number, period: number): number {
  return tStart + (index / denom) * period;
}

function resolveMoonSamplePeriod(moon: MoonParams, tStart: number): number {
  const moonEl0 = resolveOrbitElements(moon.orbitAroundPlanet, tStart, "moon.orbitAroundPlanet");
  return assertPositiveSamplePeriod(
    moonEl0.period,
    "sampleMoonOrbitSkyAbsolute: moon.orbitAroundPlanet.period must be > 0.",
  );
}

function collectMoonSkySamples(context: MoonSampleContext): SkySample[] {
  const pts: SkySample[] = [];
  for (let i = 0; i < context.samples; i++) {
    const tt = sampleTime(context.tStart, i, context.denom, context.moonPeriod);

    // rBary is interpreted consistently with the main sim: it may represent a barycenter orbit
    // if planet+moon masses are provided and the sim chooses to split around rBary.
    const rBary = posFromElements(context.params.planet.orbit, tt, "planet.orbit");
    const moonState = getMoonStateAt(context.params, tt, context.observerDir, rBary);
    pts.push(moonState?.moonSky ?? projectToSky(rBary, context.observerDir));
  }

  return pts;
}
