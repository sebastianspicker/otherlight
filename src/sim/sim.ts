// src/sim/sim.ts

import type { OrbitElements, StepResult, SystemParams } from "../core/types";
import type { Vec3 } from "../physics/vec3";
import { vAdd, vDot, vNormalizeOrThrow, vIsFinite } from "../physics/vec3";
import { solveKeplerE, radiusFromE, trueAnomalyFromE } from "../physics/kepler";
import { perifocalToInertial, projectToSky } from "../physics/frames";
import { fluxUniformDisk, type Occulter } from "../photometry/transitUniform";

function assertOrbit(el: OrbitElements, name: string): void {
  if (!Number.isFinite(el.a) || el.a <= 0) throw new Error(`${name}.a must be > 0`);
  if (!Number.isFinite(el.e) || el.e < 0 || el.e >= 1) throw new Error(`${name}.e must be in [0, 1)`);
  if (!Number.isFinite(el.period) || el.period <= 0) throw new Error(`${name}.period must be > 0`);
  if (!Number.isFinite(el.inc)) throw new Error(`${name}.inc must be finite`);
  if (!Number.isFinite(el.Omega)) throw new Error(`${name}.Omega must be finite`);
  if (!Number.isFinite(el.omega)) throw new Error(`${name}.omega must be finite`);
  if (!Number.isFinite(el.t0)) throw new Error(`${name}.t0 must be finite`);
}

function getObserverDir(params: SystemParams): Vec3 {
  const dir = params.observer?.dir ?? { x: 0, y: 0, z: 1 };
  if (!vIsFinite(dir)) throw new Error("observer.dir must be finite.");
  return vNormalizeOrThrow(dir, 1e-15, "observer.dir must be non-zero.");
}

function posFromElements(el: OrbitElements, t: number, nameForErrors: string): Vec3 {
  assertOrbit(el, nameForErrors);

  // mean motion n = 2π / period
  const n = (2 * Math.PI) / el.period;

  // mean anomaly M(t) = n (t - t0)
  const M = n * (t - el.t0);

  const E = solveKeplerE(M, el.e);
  const nu = trueAnomalyFromE(E, el.e);
  const r = radiusFromE(el.a, el.e, E);

  // PQW (perifocal) position: [r cosν, r sinν, 0]
  const rPQW: Vec3 = { x: r * Math.cos(nu), y: r * Math.sin(nu), z: 0 };

  // PQW -> inertial by Ω, i, ω (as defined in frames.ts)
  return perifocalToInertial(rPQW, el.Omega, el.inc, el.omega);
}

export function sampleOrbitSky(
  el: OrbitElements,
  tStart: number,
  samples = 256,
  observerDir?: Vec3
): Array<{ x: number; y: number; z: number }> {
  assertOrbit(el, "orbit");

  const N = Math.max(16, Math.floor(samples));
  const dir = observerDir ?? { x: 0, y: 0, z: 1 };

  const pts: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < N; i++) {
    const t = tStart + (i / N) * el.period;
    const r = posFromElements(el, t, "orbit");
    pts.push(projectToSky(r, dir));
  }
  return pts;
}

function couldOverlapStarOnSky(dx: number, dy: number, rOcc: number, rStar: number): boolean {
  // Cheap reject for photometry: if projected center distance exceeds sum of radii, no overlap possible.
  return Math.hypot(dx, dy) < rStar + rOcc;
}

export function stepSystem(params: SystemParams, t: number): StepResult {
  if (!params.star || !params.planet) throw new Error("stepSystem: missing star/planet params.");
  if (!Number.isFinite(params.star.r) || params.star.r <= 0) throw new Error("star.r must be > 0");
  if (!Number.isFinite(params.planet.r) || params.planet.r <= 0) throw new Error("planet.r must be > 0");

  const observerDir = getObserverDir(params);

  const rPlanet = posFromElements(params.planet.orbit, t, "planet.orbit");
  const planetSky = projectToSky(rPlanet, observerDir);

  const occulters: Occulter[] = [];

  // In-front test: positive depth along observer direction.
  const planetInFront = vDot(rPlanet, observerDir) > 0;
  if (planetInFront && couldOverlapStarOnSky(planetSky.x, planetSky.y, params.planet.r, params.star.r)) {
    occulters.push({ dx: planetSky.x, dy: planetSky.y, r: params.planet.r });
  }

  let moonSky: { x: number; y: number; z: number } | undefined;

  if (params.moon) {
    if (!Number.isFinite(params.moon.r) || params.moon.r <= 0) throw new Error("moon.r must be > 0");

    const rMoonRel = posFromElements(params.moon.orbitAroundPlanet, t, "moon.orbitAroundPlanet");
    const rMoonAbs = vAdd(rPlanet, rMoonRel);

    moonSky = projectToSky(rMoonAbs, observerDir);

    const moonInFront = vDot(rMoonAbs, observerDir) > 0;
    if (moonInFront && couldOverlapStarOnSky(moonSky.x, moonSky.y, params.moon.r, params.star.r)) {
      occulters.push({ dx: moonSky.x, dy: moonSky.y, r: params.moon.r });
    }
  }

  const flux = fluxUniformDisk({
    rStar: params.star.r,
    rOcculters: occulters,
  });

  return { flux, planetSky, moonSky };
}

export function sampleMoonOrbitSkyAbsolute(
  params: SystemParams,
  tStart: number,
  samples = 256
): Array<{ x: number; y: number; z: number }> {
  if (!params.moon) return [];

  const observerDir = getObserverDir(params);

  const N = Math.max(16, Math.floor(samples));
  const pts: Array<{ x: number; y: number; z: number }> = [];

  // Note: We sample using the moon's own period for a visually smooth moon track.
  const moonPeriod = params.moon.orbitAroundPlanet.period;
  if (!Number.isFinite(moonPeriod) || moonPeriod <= 0) throw new Error("moon.orbitAroundPlanet.period must be > 0");

  for (let i = 0; i < N; i++) {
    const t = tStart + (i / N) * moonPeriod;

    const rPlanet = posFromElements(params.planet.orbit, t, "planet.orbit");
    const rMoonRel = posFromElements(params.moon.orbitAroundPlanet, t, "moon.orbitAroundPlanet");
    const rMoonAbs = vAdd(rPlanet, rMoonRel);

    pts.push(projectToSky(rMoonAbs, observerDir));
  }

  return pts;
}
