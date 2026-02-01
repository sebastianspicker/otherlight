// src/sim/sampling.ts
//
// Orbit sampling helpers for visualization (sky-plane paths).
//
// Conventions (project-wide):
// - Time in seconds, angles in radians, lengths in simulation units.
// - `observer.dir` points from the star toward the observer.
// - `projectToSky(r, observerDir)` projects inertial position r into sky plane coordinates.

import type { OrbitElements, OrbitElementsProvider, SystemParams } from "../core/types";
import type { Vec3 } from "../physics/vec3";
import { vAdd, vNormalizeOrThrow } from "../physics/vec3";
import { projectToSky } from "../physics/frames";
import { trySplitBarycentricPair } from "../physics/barycenter";
import { applyOrientationEvolution } from "../physics/exomoonTiming";
import { toFiniteNumber } from "../core/units";
import { getObserverDir } from "./observer";
import { posFromElements, resolveOrbitElements } from "./orbits";
import { computeMoonSkyDriftY, getExomoonConfig } from "./kinematics";

export type OrbitSampleOptions = {
  /**
   * If true, include the endpoint at phase 1 (tStart + period) as the last sample.
   * Default false to avoid duplicating the start point in closed orbit rendering.
   */
  includeEndpoint?: boolean;
};

export function sampleOrbitSky(
  elOrProvider: OrbitElements | OrbitElementsProvider,
  tStart: number,
  samples = 256,
  observerDir?: Vec3,
  opts: OrbitSampleOptions = {},
): Array<{ x: number; y: number; z: number }> {
  if (!Number.isFinite(tStart)) throw new Error("sampleOrbitSky: tStart must be finite.");

  const N = Math.max(16, Math.floor(toFiniteNumber(samples, 256)));

  const dirRaw = observerDir ?? { x: 0, y: 0, z: 1 };
  const dir = vNormalizeOrThrow(dirRaw, 1e-15, "sampleOrbitSky: observerDir must be non-zero.");

  // Use the period at tStart as the sampling span (stable for rendering even if a provider varies slowly).
  const el0 = resolveOrbitElements(elOrProvider, tStart, "orbit");
  const period0 = el0.period;
  if (!Number.isFinite(period0) || period0 <= 0) throw new Error("sampleOrbitSky: orbit.period must be > 0.");

  const includeEndpoint = Boolean(opts.includeEndpoint);
  const denom = includeEndpoint ? Math.max(1, N - 1) : N;

  const pts: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < N; i++) {
    const tt = tStart + (i / denom) * period0;
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
): Array<{ x: number; y: number; z: number }> {
  if (!params.moon) return [];
  if (!Number.isFinite(tStart)) throw new Error("sampleMoonOrbitSkyAbsolute: tStart must be finite.");

  const observerDir = getObserverDir(params);
  const N = Math.max(16, Math.floor(toFiniteNumber(samples, 256)));

  const moonEl0 = resolveOrbitElements(params.moon.orbitAroundPlanet, tStart, "moon.orbitAroundPlanet");
  const moonPeriod = moonEl0.period;
  if (!Number.isFinite(moonPeriod) || moonPeriod <= 0) {
    throw new Error("sampleMoonOrbitSkyAbsolute: moon.orbitAroundPlanet.period must be > 0.");
  }

  const exo = getExomoonConfig(params);
  const exoEnabled = Boolean(exo?.enabled);
  const tRef = toFiniteNumber(exo?.tRef, 0);

  const includeEndpoint = Boolean(opts.includeEndpoint);
  const denom = includeEndpoint ? Math.max(1, N - 1) : N;

  const pts: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < N; i++) {
    const tt = tStart + (i / denom) * moonPeriod;

    // rBary is interpreted consistently with the main sim: it may represent a barycenter orbit
    // if planet+moon masses are provided and the sim chooses to split around rBary.
    const rBary = posFromElements(params.planet.orbit, tt, "planet.orbit");

    const moonOrbitBaseEl = resolveOrbitElements(params.moon.orbitAroundPlanet, tt, "moon.orbitAroundPlanet");
    const moonOrbitEvolvedEl: OrbitElements = exoEnabled
      ? applyOrientationEvolution(moonOrbitBaseEl, tt, {
          enabled: true,
          tRef,
          OmegaDot: exo?.moonOmegaDot,
          incDot: exo?.moonIncDot,
          omegaDot: exo?.moonOmegaSmallDot,
          Omega0: exo?.moonOmega0,
          inc0: exo?.moonInc0,
          omega0: exo?.moonOmegaSmall0,
          wrapAngles: "2pi",
          clampInc01Pi: true,
        })
      : moonOrbitBaseEl;

    const rMoonRel = posFromElements(moonOrbitEvolvedEl, tt, "moon.orbitAroundPlanet");

    const split = trySplitBarycentricPair({
      rBary,
      rRel: rMoonRel, // vector from planet to moon
      mPrimary: params.planet.m,
      mSecondary: params.moon.m,
    });

    const rMoonAbs = split ? split.rSecondary : vAdd(rBary, rMoonRel);
    const sky = projectToSky(rMoonAbs, observerDir);

    const driftY = computeMoonSkyDriftY(exo, tt);
    pts.push(driftY !== 0 ? { x: sky.x, y: sky.y + driftY, z: sky.z } : sky);
  }

  return pts;
}
