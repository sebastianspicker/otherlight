// src/sim/kinematics.ts

import type { ExomoonTimingShapeParams, OrbitElements, SkyPoint, SystemParams } from "../core/types";
import { G_SI, isFinitePositive, toFiniteNumber, wrapTo2Pi } from "../core/units";
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

function computeMoonSkyDriftY(exo: ExomoonTimingShapeParams | undefined, t: number): number {
  const enabled = Boolean(exo?.enabled);
  if (!enabled) return 0;
  const tRef = toFiniteNumber(exo?.tRef, 0);
  const yDot = toFiniteNumber(exo?.moonImpactYDot, 0);

  // Toy model: linear sky-plane y drift (units/s) relative to tRef.
  // This is phenomenological and not strictly Kepler-consistent.
  if (!Number.isFinite(yDot) || yDot === 0) return 0;
  return (t - tRef) * yDot;
}

function applyJ2SecularPrecession(
  el: OrbitElements,
  dtSec: number,
  params: { J2?: number; centralRadius?: number; mu?: number },
): OrbitElements {
  const J2 = params.J2;
  const R = params.centralRadius;
  const mu = params.mu;
  if (!(Number.isFinite(J2) && (J2 as number) !== 0)) return el;
  if (!(Number.isFinite(R) && (R as number) > 0)) return el;
  if (!(Number.isFinite(mu) && (mu as number) > 0)) return el;
  if (!(Number.isFinite(el.a) && el.a > 0)) return el;
  if (!(Number.isFinite(el.e) && el.e >= 0 && el.e < 1)) return el;
  if (!(Number.isFinite(el.inc) && el.inc >= 0 && el.inc <= Math.PI)) return el;

  const a = el.a;
  const e = el.e;
  const i = el.inc;
  const n = Math.sqrt((mu as number) / (a * a * a));
  const fac = ((R as number) * (R as number)) / (a * a * Math.pow(1 - e * e, 2));
  const OmegaDot = -1.5 * (J2 as number) * n * fac * Math.cos(i);
  const omegaDot = 0.75 * (J2 as number) * n * fac * (5 * Math.cos(i) * Math.cos(i) - 1);

  return {
    ...el,
    Omega: wrapTo2Pi(el.Omega + OmegaDot * dtSec),
    omega: wrapTo2Pi(el.omega + omegaDot * dtSec),
  };
}

function applyTidalSecularEvolution(
  el: OrbitElements,
  dtSec: number,
  params: {
    tides?: { enabled?: boolean; k2?: number; Q?: number; daDt?: number; deDt?: number };
    centralRadius?: number;
    mu?: number;
  },
): OrbitElements {
  const tides = params.tides;
  if (!tides?.enabled) return el;
  if (!Number.isFinite(dtSec) || dtSec === 0) return el;

  let daDt = Number.isFinite(tides.daDt) ? (tides.daDt as number) : 0;
  let deDt = Number.isFinite(tides.deDt) ? (tides.deDt as number) : 0;

  const k2 = tides.k2;
  const Q = tides.Q;
  const R = params.centralRadius;
  const mu = params.mu;
  if (
    daDt === 0 &&
    deDt === 0 &&
    Number.isFinite(k2) &&
    (k2 as number) > 0 &&
    Number.isFinite(Q) &&
    (Q as number) > 0
  ) {
    if (
      Number.isFinite(R) &&
      (R as number) > 0 &&
      Number.isFinite(mu) &&
      (mu as number) > 0 &&
      Number.isFinite(el.a) &&
      el.a > 0 &&
      Number.isFinite(el.e) &&
      el.e >= 0 &&
      el.e < 1
    ) {
      const n = Math.sqrt((mu as number) / (el.a * el.a * el.a));
      const s = ((k2 as number) / (Q as number)) * Math.pow((R as number) / el.a, 5) * n;
      deDt = -s * el.e;
      daDt = -2 * s * el.a * el.e * el.e;
    }
  }

  if (!Number.isFinite(daDt)) daDt = 0;
  if (!Number.isFinite(deDt)) deDt = 0;
  if (daDt === 0 && deDt === 0) return el;

  const a = Math.max(1e-6, el.a + daDt * dtSec);
  const e = Math.min(0.999999, Math.max(0, el.e + deDt * dtSec));
  const period =
    Number.isFinite(params.mu) && (params.mu as number) > 0
      ? 2 * Math.PI * Math.sqrt((a * a * a) / (params.mu as number))
      : el.period;
  return { ...el, a, e, period: Number.isFinite(period) && period > 0 ? period : el.period };
}

function applySecularPlanetOrbit(params: SystemParams, t: number, el: OrbitElements): OrbitElements {
  const sec = params.dynamics?.secular;
  if (!sec?.enabled) return el;
  const dtSec = t - toFiniteNumber(sec.tRef, 0);

  const mu = (() => {
    try {
      return muFromPeriodAndA(el.period, el.a);
    } catch {
      return undefined;
    }
  })();

  let out = el;
  if (sec.j2Precession) {
    out = applyJ2SecularPrecession(out, dtSec, {
      J2: params.star.gravityHarmonics?.J2,
      centralRadius: params.star.r,
      mu,
    });
  }
  if (sec.tides) {
    out = applyTidalSecularEvolution(out, dtSec, {
      tides: params.planet.tides,
      centralRadius: params.star.r,
      mu,
    });
  }
  return out;
}

function applySecularMoonOrbit(params: SystemParams, t: number, el: OrbitElements): OrbitElements {
  const sec = params.dynamics?.secular;
  if (!sec?.enabled || !params.moon) return el;
  const dtSec = t - toFiniteNumber(sec.tRef, 0);

  const mu = (() => {
    if (Number.isFinite(params.planet.m) && (params.planet.m as number) > 0) {
      const mMoon = Number.isFinite(params.moon?.m) ? (params.moon!.m as number) : 0;
      return G_SI * ((params.planet.m as number) + Math.max(0, mMoon));
    }
    try {
      return muFromPeriodAndA(el.period, el.a);
    } catch {
      return undefined;
    }
  })();

  let out = el;
  if (sec.j2Precession) {
    out = applyJ2SecularPrecession(out, dtSec, {
      J2: params.planet.gravityHarmonics?.J2,
      centralRadius: params.planet.r,
      mu,
    });
  }
  if (sec.tides) {
    out = applyTidalSecularEvolution(out, dtSec, {
      tides: params.moon.tides,
      centralRadius: params.planet.r,
      mu,
    });
  }
  return out;
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
    posFromResolvedElements(
      applySecularPlanetOrbit(params, t, resolveOrbitElements(params.planet.orbit, t, "planet.orbit")),
      t,
      "planet.orbit",
    );

  const moonOrbitBaseEl = applySecularMoonOrbit(
    params,
    t,
    resolveOrbitElements(params.moon.orbitAroundPlanet, t, "moon.orbitAroundPlanet"),
  );
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
  let planetOrbit = applySecularPlanetOrbit(
    params,
    t,
    resolveOrbitElements(params.planet.orbit, t, "planet.orbit"),
  );
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
      ? {
          enabled: true,
          mu:
            params.dynamics?.relativityLevel === "enhanced"
              ? (muStarRel as number) +
                (isFinitePositive(params.planet.m) ? G_SI * (params.planet.m as number) : 0) +
                (isFinitePositive(params.moon?.m) ? G_SI * (params.moon!.m as number) : 0)
              : (muStarRel as number),
          minImpact: rel.shapiroMinImpact,
        }
      : undefined;

  let rPlanetAbs: Vec3 = rBary;
  let rMoonAbs: Vec3 | undefined;
  let moonSky: SkyPoint | undefined;

  let rBaryOut = rBary;

  if (nbodyActive) {
    const shapiroSolve =
      rel.enabled && rel.shapiro && params.dynamics?.relativityLevel === "enhanced"
        ? {
            enabled: true,
            minImpact: rel.shapiroMinImpact,
            massesAtTime: (ti: number) => {
              const nb = getNBodyStateAt(params, ti);
              if (!nb) return [];
              return [
                isFinitePositive(muStarRel) ? { mu: muStarRel as number, r: { x: 0, y: 0, z: 0 } } : null,
                isFinitePositive(params.planet.m)
                  ? {
                      mu: G_SI * (params.planet.m as number),
                      r: vSub(nb.state.rP, nb.state.rS),
                    }
                  : null,
                isFinitePositive(params.moon?.m)
                  ? {
                      mu: G_SI * (params.moon!.m as number),
                      r: vSub(nb.state.rM, nb.state.rS),
                    }
                  : null,
              ].filter(Boolean) as Array<{ mu: number; r: Vec3 }>;
            },
          }
        : shapiroParams;

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
          shapiro: shapiroSolve,
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
            shapiro: shapiroSolve,
            maxIters: rel.ltteIters,
            tolSec: rel.ltteTolSec,
          })
        : t;

    planetOrbit = applySecularPlanetOrbit(
      params,
      tPlanet,
      resolveOrbitElements(params.planet.orbit, tPlanet, "planet.orbit"),
    );

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
      const base = applySecularPlanetOrbit(
        params,
        ti,
        resolveOrbitElements(params.planet.orbit, ti, "planet.orbit"),
      );
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
          shapiro:
            rel.enabled && rel.shapiro && params.dynamics?.relativityLevel === "enhanced"
              ? {
                  enabled: true,
                  minImpact: rel.shapiroMinImpact,
                  massesAtTime: (ti: number) => {
                    const masses: Array<{ mu: number; r: Vec3 }> = [];
                    if (isFinitePositive(muStarRel)) {
                      masses.push({ mu: muStarRel as number, r: { x: 0, y: 0, z: 0 } });
                    }
                    if (isFinitePositive(params.planet.m)) {
                      masses.push({
                        mu: G_SI * (params.planet.m as number),
                        r: planetAbsAt(ti),
                      });
                    }
                    if (params.moon && isFinitePositive(params.moon.m)) {
                      masses.push({
                        mu: G_SI * (params.moon.m as number),
                        r: moonAbsAt(ti),
                      });
                    }
                    return masses;
                  },
                }
              : shapiroParams,
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
            shapiro:
              rel.enabled && rel.shapiro && params.dynamics?.relativityLevel === "enhanced"
                ? {
                    enabled: true,
                    minImpact: rel.shapiroMinImpact,
                    massesAtTime: (ti: number) => {
                      const masses: Array<{ mu: number; r: Vec3 }> = [];
                      if (isFinitePositive(muStarRel)) {
                        masses.push({ mu: muStarRel as number, r: { x: 0, y: 0, z: 0 } });
                      }
                      if (isFinitePositive(params.planet.m)) {
                        masses.push({
                          mu: G_SI * (params.planet.m as number),
                          r: planetAbsAt(ti),
                        });
                      }
                      if (params.moon && isFinitePositive(params.moon.m)) {
                        masses.push({
                          mu: G_SI * (params.moon.m as number),
                          r: moonAbsAt(ti),
                        });
                      }
                      return masses;
                    },
                  }
                : shapiroParams,
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
