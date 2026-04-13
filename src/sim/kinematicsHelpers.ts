// src/sim/kinematics.ts

import type { ExomoonTimingShapeParams, OrbitElements, SkyPoint, SystemParams } from "../core/types";
import { G_SI, isFinitePositive, toFiniteNumber, wrapTo2Pi } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { vAdd, vAddScaled } from "../physics/vec3";
import { buildSkyBasis, projectToSky } from "../physics/frames";
import { trySplitBarycentricPair } from "../physics/barycenter";
import { applyOrientationEvolution } from "../physics/exomoonTiming";
import {
  applyApsidalPrecession,
  resolveGrPrecessionPerOrbit,
  type LightTimeSolveDiagnostics,
  type NormalizedRelativityParams,
} from "../physics/relativity";
import { muFromPeriodAndA } from "../physics/kepler";
import { posFromResolvedElements, resolveOrbitElements } from "./orbits";

export type BodyKinematics = {
  planetOrbit: OrbitElements;
  rBary: Vec3;
  rPlanetAbs: Vec3;
  rMoonAbs?: Vec3;
  planetSky: SkyPoint;
  moonSky?: SkyPoint;
  timingSolve?: {
    planet?: LightTimeSolveDiagnostics;
    moon?: LightTimeSolveDiagnostics;
  };
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
  const { J2, centralRadius: R, mu } = params;
  if (!isFinitePositive(mu)) return el;
  if (!isFinitePositive(R)) return el;
  if (!(Number.isFinite(J2) && J2 !== 0)) return el;
  if (!(Number.isFinite(el.a) && el.a > 0)) return el;
  if (!(Number.isFinite(el.e) && el.e >= 0 && el.e < 1)) return el;
  if (!(Number.isFinite(el.inc) && el.inc >= 0 && el.inc <= Math.PI)) return el;

  const a = el.a;
  const e = el.e;
  const i = el.inc;
  const n = Math.sqrt(mu / (a * a * a));
  const fac = (R * R) / (a * a * Math.pow(1 - e * e, 2));
  const OmegaDot = -1.5 * J2! * n * fac * Math.cos(i);
  const omegaDot = 0.75 * J2! * n * fac * (5 * Math.cos(i) * Math.cos(i) - 1);

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

  let daDt = Number.isFinite(tides.daDt) ? tides.daDt! : 0;
  let deDt = Number.isFinite(tides.deDt) ? tides.deDt! : 0;

  const { k2, Q } = tides;
  const { centralRadius: R, mu } = params;
  if (daDt === 0 && deDt === 0 && isFinitePositive(k2) && isFinitePositive(Q)) {
    if (
      isFinitePositive(R) &&
      isFinitePositive(mu) &&
      Number.isFinite(el.a) &&
      el.a > 0 &&
      Number.isFinite(el.e) &&
      el.e >= 0 &&
      el.e < 1
    ) {
      const n = Math.sqrt(mu / (el.a * el.a * el.a));
      // Goldreich & Soter (1966) prefactors: 21/2 for both da/dt and de/dt.
      // da/dt = -(21) * (k2/Q) * (R/a)^5 * n * a * e^2
      // de/dt = -(21/2) * (k2/Q) * (R/a)^5 * n * e
      const s = (k2 / Q) * Math.pow(R / el.a, 5) * n;
      deDt = -(21 / 2) * s * el.e;
      daDt = -21 * s * el.a * el.e * el.e;
    }
  }

  if (!Number.isFinite(daDt)) daDt = 0;
  if (!Number.isFinite(deDt)) deDt = 0;
  if (daDt === 0 && deDt === 0) return el;

  let a = Math.max(1e-6, el.a + daDt * dtSec);
  let e = Math.min(0.999999, Math.max(0, el.e + deDt * dtSec));

  // Clamp: if the relative change exceeds 50%, the Euler step has grown
  // unboundedly and the result is physically meaningless.  Clamp to +/-50%
  // of the original value and warn.
  const MAX_REL_CHANGE = 0.5;
  const relDaRaw = Math.abs(a - el.a) / Math.max(el.a, 1e-15);
  const relDeRaw = el.e > 1e-12 ? Math.abs(e - el.e) / el.e : Math.abs(e - el.e);

  if (relDaRaw > MAX_REL_CHANGE) {
    const sign = a >= el.a ? 1 : -1;
    a = Math.max(1e-6, el.a * (1 + sign * MAX_REL_CHANGE));
    console.warn(
      `applyTidalSecularEvolution: clamped da/a from ${relDaRaw.toFixed(4)} to ${MAX_REL_CHANGE}. ` +
        `dtSec=${dtSec.toExponential(3)} is too large for stable tidal evolution.`,
    );
  }
  if (relDeRaw > MAX_REL_CHANGE && el.e > 1e-12) {
    const sign = e >= el.e ? 1 : -1;
    e = Math.min(0.999999, Math.max(0, el.e * (1 + sign * MAX_REL_CHANGE)));
    console.warn(
      `applyTidalSecularEvolution: clamped de/e from ${relDeRaw.toFixed(4)} to ${MAX_REL_CHANGE}. ` +
        `dtSec=${dtSec.toExponential(3)} is too large for stable tidal evolution.`,
    );
  }

  // Warn if secular changes are large relative to the orbit (> 10% per step),
  // which may indicate an excessively large time step or pathological tidal parameters.
  const relDa = Math.abs(a - el.a) / Math.max(el.a, 1e-15);
  const relDe = el.e > 1e-12 ? Math.abs(e - el.e) / el.e : Math.abs(e - el.e);
  if (relDa > 0.1 || relDe > 0.1) {
    console.warn(
      `applyTidalSecularEvolution: large secular change detected (da/a=${relDa.toFixed(4)}, de/e=${relDe.toFixed(4)}). ` +
        `Consider reducing the time step or clamping tidal parameters.`,
    );
  }

  // Always recompute period from the new semi-major axis via Kepler's third law.
  // When mu is available, use it directly; otherwise derive mu from the original
  // period and semi-major axis to ensure consistency between a and period.
  let muEff: number | undefined = mu;
  if (!isFinitePositive(muEff)) {
    // Derive mu from original orbit elements (period and a).
    if (Number.isFinite(el.period) && el.period > 0 && Number.isFinite(el.a) && el.a > 0) {
      const n0 = (2 * Math.PI) / el.period;
      muEff = n0 * n0 * el.a * el.a * el.a;
    }
  }
  const period = isFinitePositive(muEff) ? 2 * Math.PI * Math.sqrt((a * a * a) / muEff!) : el.period;
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
      // Fail-open: invalid period/semi-major axis; skip mu-dependent secular corrections for the planet.
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
    if (isFinitePositive(params.planet.m)) {
      const mMoon = isFinitePositive(params.moon?.m) ? params.moon!.m : 0;
      return G_SI * (params.planet.m + Math.max(0, mMoon));
    }
    try {
      return muFromPeriodAndA(el.period, el.a);
    } catch {
      // Fail-open: invalid period/semi-major axis; skip mu-dependent secular corrections for the moon.
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

export function resolvePlanetOrbitForKinematics(
  params: SystemParams,
  t: number,
  nameForErrors = "planet.orbit",
): OrbitElements {
  return applySecularPlanetOrbit(params, t, resolveOrbitElements(params.planet.orbit, t, nameForErrors));
}

export function resolveMoonOrbitForKinematics(
  params: SystemParams,
  t: number,
  nameForErrors = "moon.orbitAroundPlanet",
): OrbitElements | undefined {
  if (!params.moon) return undefined;
  return applySecularMoonOrbit(
    params,
    t,
    resolveOrbitElements(params.moon.orbitAroundPlanet, t, nameForErrors),
  );
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
  if (!Number.isFinite(params.moon.r) || params.moon.r <= 0)
    throw new Error("getMoonStateAt: moon.r must be > 0.");

  const exo = getExomoonConfig(params);
  const exoEnabled = Boolean(exo?.enabled);
  const tRef = toFiniteNumber(exo?.tRef, 0);
  const driftY = computeMoonSkyDriftY(exo, t);

  // Planet "orbit" is interpreted as barycenter orbit if a valid planet+moon mass pair exists.
  // Otherwise it is treated as the planet orbit directly, and the moon is placed relative to it.
  // OPTIMIZATION: Use rBaryOverride if provided to avoid re-calculating Kepler orbit.
  const rBary =
    rBaryOverride ??
    posFromResolvedElements(resolvePlanetOrbitForKinematics(params, t, "planet.orbit"), t, "planet.orbit");

  const moonOrbitBaseEl = resolveMoonOrbitForKinematics(params, t, "moon.orbitAroundPlanet");
  if (!moonOrbitBaseEl) return undefined;
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

// TODO: The LTTE + Shapiro time-correction logic is duplicated between the N-body
// branch and the Kepler branch below.  Extract a shared helper (e.g.
