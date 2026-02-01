// src/sim/kinematics.ts

import type { ExomoonTimingShapeParams, OrbitElements, SkyPoint, SystemParams } from "../core/types";
import { isFinitePositive, toFiniteNumber } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { vAdd, vAddScaled, vSub } from "../physics/vec3";
import { buildSkyBasis, projectToSky } from "../physics/frames";
import { trySplitBarycentricPair } from "../physics/barycenter";
import { applyOrientationEvolution } from "../physics/exomoonTiming";
import {
  applyApsidalPrecession,
  normalizeRelativityParams,
  resolveGrPrecessionPerOrbit,
  solveLightTimeCorrectedTime,
  type NormalizedRelativityParams,
} from "../physics/relativity";
import { muFromPeriodAndA } from "../physics/kepler";
import { posFromResolvedElements, resolveOrbitElements } from "./orbits";
import { getNBodyStateAt, isNBodyEnabled } from "./dynamics";

export type BodyKinematics = {
  planetOrbit: OrbitElements;
  rBary: Vec3;
  rPlanetAbs: Vec3;
  rMoonAbs?: Vec3;
  planetSky: SkyPoint;
  moonSky?: SkyPoint;
};

export type MoonStateAt = {
  rBary: Vec3;
  rPlanetAbs: Vec3;
  rMoonAbs: Vec3;
  rMoonRel: Vec3;
  moonSky: SkyPoint;
  driftY: number;
};

export function getExomoonConfig(params: SystemParams): ExomoonTimingShapeParams | undefined {
  return params.dynamics?.exomoonTimingShape;
}

export function computeMoonSkyDriftY(exo: ExomoonTimingShapeParams | undefined, t: number): number {
  const enabled = Boolean(exo?.enabled);
  if (!enabled) return 0;
  const tRef = toFiniteNumber(exo?.tRef, 0);
  const yDot = toFiniteNumber(exo?.moonImpactYDot, 0);

  // Toy model: linear sky-plane y drift (units/s) relative to tRef.
  // This is phenomenological and not strictly Kepler-consistent.
  if (!Number.isFinite(yDot) || yDot === 0) return 0;
  return (t - tRef) * yDot;
}

/**
 * Compute moon absolute state at time t (including optional orbit orientation evolution,
 * barycentric splitting, and optional sky-plane y drift).
 *
 * Returns undefined if no moon is configured.
 */
export function getMoonStateAt(
  params: SystemParams,
  t: number,
  observerDir: Vec3,
  rBaryOverride?: Vec3,
  relativity?: NormalizedRelativityParams,
): MoonStateAt | undefined {
  if (!params.moon) return undefined;
  if (!Number.isFinite(t)) throw new Error("getMoonStateAt: t must be finite.");
  if (!Number.isFinite(params.moon.r) || params.moon.r <= 0) throw new Error("moon.r must be > 0");

  const exo = getExomoonConfig(params);
  const exoEnabled = Boolean(exo?.enabled);
  const tRef = toFiniteNumber(exo?.tRef, 0);
  const driftY = computeMoonSkyDriftY(exo, t);

  // Planet "orbit" is interpreted as barycenter orbit if a valid planet+moon mass pair exists.
  // Otherwise it is treated as the planet orbit directly, and the moon is placed relative to it.
  // OPTIMIZATION: Use rBaryOverride if provided to avoid re-calculating Kepler orbit.
  const rBary =
    rBaryOverride ??
    posFromResolvedElements(resolveOrbitElements(params.planet.orbit, t, "planet.orbit"), t, "planet.orbit");

  const moonOrbitBaseEl = resolveOrbitElements(params.moon.orbitAroundPlanet, t, "moon.orbitAroundPlanet");
  const moonOrbitEvolvedEl = exoEnabled
    ? applyOrientationEvolution(moonOrbitBaseEl, t, {
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

  const grOn = Boolean(relativity?.enabled && relativity?.grPrecession);
  const moonPrec = grOn
    ? resolveGrPrecessionPerOrbit({
        orbit: moonOrbitEvolvedEl,
        c: relativity!.c,
        override: relativity!.moonPrecessionPerOrbit,
      })
    : 0;
  const moonOrbitRel = grOn ? applyApsidalPrecession(moonOrbitEvolvedEl, t, moonPrec) : moonOrbitEvolvedEl;

  const rMoonRel = posFromResolvedElements(moonOrbitRel, t, "moon.orbitAroundPlanet");

  const split = trySplitBarycentricPair({
    rBary,
    rRel: rMoonRel, // vector from planet -> moon
    mPrimary: params.planet.m,
    mSecondary: params.moon.m,
  });

  const rPlanetAbs = split ? split.rPrimary : rBary;
  const rMoonAbsBase = split ? split.rSecondary : vAdd(rBary, rMoonRel);

  // Apply optional sky-plane drift to the inertial position so phase-curve geometry matches.
  let rMoonAbs = rMoonAbsBase;
  if (driftY !== 0) {
    const { ey } = buildSkyBasis(observerDir);
    rMoonAbs = vAddScaled(rMoonAbsBase, ey, driftY);
  }

  const ms = projectToSky(rMoonAbs, observerDir);
  const moonSky = ms;

  return { rBary, rPlanetAbs, rMoonAbs, rMoonRel, moonSky, driftY };
}

export function computeBodyKinematics(params: SystemParams, t: number, observerDir: Vec3): BodyKinematics {
  if (!Number.isFinite(t)) throw new Error("computeBodyKinematics: t must be finite.");

  const nbodyActive = isNBodyEnabled(params);
  const rel = normalizeRelativityParams(params.dynamics?.relativity);

  // Base: planet orbit (or barycenter orbit if masses exist and splitting is possible).
  let planetOrbit = resolveOrbitElements(params.planet.orbit, t, "planet.orbit");
  const rBary = posFromResolvedElements(planetOrbit, t, "planet.orbit");

  const muStarRel =
    nbodyActive && isFinitePositive(params.dynamics?.nbodyPlanetMoon?.muStar)
      ? (params.dynamics!.nbodyPlanetMoon!.muStar as number)
      : (() => {
          try {
            const mu = muFromPeriodAndA(planetOrbit.period, planetOrbit.a);
            return Number.isFinite(mu) && mu > 0 ? mu : undefined;
          } catch {
            return undefined;
          }
        })();

  const shapiroParams =
    rel.enabled && rel.shapiro && isFinitePositive(muStarRel)
      ? { enabled: true, mu: muStarRel as number, minImpact: rel.shapiroMinImpact }
      : undefined;

  let rPlanetAbs: Vec3 = rBary;
  let rMoonAbs: Vec3 | undefined;
  let moonSky: SkyPoint | undefined;

  let rBaryOut = rBary;

  if (nbodyActive) {
    const ltteOn = rel.enabled && rel.ltte;
    const tPlanet = ltteOn
      ? solveLightTimeCorrectedTime({
          tObs: t,
          rAtTime: (ti) => {
            const nb = getNBodyStateAt(params, ti);
            return nb ? vSub(nb.state.rP, nb.state.rS) : rBary;
          },
          observerDir,
          c: rel.c,
          shapiro: shapiroParams,
          maxIters: rel.ltteIters,
          tolSec: rel.ltteTolSec,
        })
      : t;
    const tMoon =
      ltteOn && params.moon
        ? solveLightTimeCorrectedTime({
            tObs: t,
            rAtTime: (ti) => {
              const nb = getNBodyStateAt(params, ti);
              return nb ? vSub(nb.state.rM, nb.state.rS) : rBary;
            },
            observerDir,
            c: rel.c,
            shapiro: shapiroParams,
            maxIters: rel.ltteIters,
            tolSec: rel.ltteTolSec,
          })
        : t;

    planetOrbit = resolveOrbitElements(params.planet.orbit, tPlanet, "planet.orbit");

    const nbodyPlanet = getNBodyStateAt(params, tPlanet);
    if (nbodyPlanet) {
      rBaryOut = nbodyPlanet.rBary;
      rPlanetAbs = vSub(nbodyPlanet.state.rP, nbodyPlanet.state.rS);
    }

    if (params.moon) {
      const nbodyMoon = ltteOn && tMoon !== tPlanet ? getNBodyStateAt(params, tMoon) : nbodyPlanet;
      if (nbodyMoon) {
        rMoonAbs = vSub(nbodyMoon.state.rM, nbodyMoon.state.rS);
        moonSky = rMoonAbs ? projectToSky(rMoonAbs, observerDir) : undefined;
      }
    }
  } else {
    const grOn = rel.enabled && rel.grPrecession;
    const ltteOn = rel.enabled && rel.ltte;

    const planetOrbitAt = (ti: number): OrbitElements => {
      const base = resolveOrbitElements(params.planet.orbit, ti, "planet.orbit");
      if (!grOn) return base;
      const prec = resolveGrPrecessionPerOrbit({
        orbit: base,
        c: rel.c,
        override: rel.planetPrecessionPerOrbit,
      });
      return applyApsidalPrecession(base, ti, prec);
    };

    const rBaryAt = (ti: number): Vec3 => {
      const el = planetOrbitAt(ti);
      return posFromResolvedElements(el, ti, "planet.orbit");
    };

    const planetAbsAt = (ti: number): Vec3 => {
      const rB = rBaryAt(ti);
      const moonState = getMoonStateAt(params, ti, observerDir, rB, rel);
      return moonState ? moonState.rPlanetAbs : rB;
    };

    const moonAbsAt = (ti: number): Vec3 => {
      const rB = rBaryAt(ti);
      const moonState = getMoonStateAt(params, ti, observerDir, rB, rel);
      return moonState?.rMoonAbs ?? rB;
    };

    const tPlanet = ltteOn
      ? solveLightTimeCorrectedTime({
          tObs: t,
          rAtTime: planetAbsAt,
          observerDir,
          c: rel.c,
          shapiro: shapiroParams,
          maxIters: rel.ltteIters,
          tolSec: rel.ltteTolSec,
        })
      : t;
    const tMoon =
      ltteOn && params.moon
        ? solveLightTimeCorrectedTime({
            tObs: t,
            rAtTime: moonAbsAt,
            observerDir,
            c: rel.c,
            shapiro: shapiroParams,
            maxIters: rel.ltteIters,
            tolSec: rel.ltteTolSec,
          })
        : t;

    planetOrbit = planetOrbitAt(tPlanet);
    const rBaryPlanet = rBaryAt(tPlanet);
    rBaryOut = rBaryPlanet;

    const moonStatePlanet = getMoonStateAt(params, tPlanet, observerDir, rBaryPlanet, rel);
    if (moonStatePlanet) {
      rPlanetAbs = moonStatePlanet.rPlanetAbs;
    } else {
      rPlanetAbs = rBaryPlanet;
    }

    if (params.moon) {
      const rBaryMoon = rBaryAt(tMoon);
      const moonState = getMoonStateAt(params, tMoon, observerDir, rBaryMoon, rel);
      if (moonState) {
        rMoonAbs = moonState.rMoonAbs;
        moonSky = moonState.moonSky;
      }
    }
  }

  const planetSky = projectToSky(rPlanetAbs, observerDir);

  return { planetOrbit, rBary: rBaryOut, rPlanetAbs, rMoonAbs, planetSky, moonSky };
}
