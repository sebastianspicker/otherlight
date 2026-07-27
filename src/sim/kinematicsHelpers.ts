/** Provides shared orbital kinematics helpers without coupling to stepping orchestration. */

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

/** Eccentricity cap just below parabolic for tidal secular evolution; e ≥ 1 is unphysical. */
const MAX_ECC_NEAR_PARABOLIC = 0.999999;

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

type J2Inputs = {
  J2?: number;
  centralRadius?: number;
  mu?: number;
};

type TidalEvolutionInputs = {
  tides?: { enabled?: boolean; k2?: number; Q?: number; daDt?: number; deDt?: number };
  centralRadius?: number;
  mu?: number;
};

type TidalDrift = {
  daDt: number;
  deDt: number;
};

type TidalOrbitUpdate = {
  a: number;
  e: number;
};

type MoonParams = NonNullable<SystemParams["moon"]>;
type MoonAbsolutePositions = {
  rPlanetAbs: Vec3;
  rMoonAbsBase: Vec3;
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

function applyJ2SecularPrecession(el: OrbitElements, dtSec: number, params: J2Inputs): OrbitElements {
  const { J2, centralRadius: R, mu } = params;
  if (!hasValidJ2Inputs(el, params)) return el;

  const { OmegaDot, omegaDot } = j2PrecessionRates(el, J2 as number, R as number, mu as number);

  return {
    ...el,
    Omega: wrapTo2Pi(el.Omega + OmegaDot * dtSec),
    omega: wrapTo2Pi(el.omega + omegaDot * dtSec),
  };
}

function hasValidJ2Inputs(el: OrbitElements, params: J2Inputs): boolean {
  return hasValidJ2Shape(params) && hasValidJ2Orbit(el);
}

function hasValidJ2Shape(params: J2Inputs): boolean {
  return (
    isFinitePositive(params.mu) &&
    isFinitePositive(params.centralRadius) &&
    Number.isFinite(params.J2) &&
    params.J2 !== 0
  );
}

function hasValidJ2Orbit(el: OrbitElements): boolean {
  return (
    isFinitePositive(el.a) &&
    Number.isFinite(el.e) &&
    el.e >= 0 &&
    el.e < 1 &&
    Number.isFinite(el.inc) &&
    el.inc >= 0 &&
    el.inc <= Math.PI
  );
}

function j2PrecessionRates(
  el: OrbitElements,
  J2: number,
  R: number,
  mu: number,
): { OmegaDot: number; omegaDot: number } {
  const n = Math.sqrt(mu / (el.a * el.a * el.a));
  const fac = (R * R) / (el.a * el.a * Math.pow(1 - el.e * el.e, 2));
  const cosInc = Math.cos(el.inc);

  return {
    OmegaDot: -1.5 * J2 * n * fac * cosInc,
    omegaDot: 0.75 * J2 * n * fac * (5 * cosInc * cosInc - 1),
  };
}

function applyTidalSecularEvolution(
  el: OrbitElements,
  dtSec: number,
  params: TidalEvolutionInputs,
): OrbitElements {
  const tides = params.tides;
  if (!canApplyTidalEvolution(tides, dtSec)) return el;

  const drift = sanitizeTidalDrift(resolveTidalDrift(el, params));
  if (drift.daDt === 0 && drift.deDt === 0) return el;

  const updated = clampTidalStep(el, dtSec, applyTidalDrift(el, dtSec, drift));
  warnLargeTidalChange(el, updated);

  const period = resolveTidalPeriod(el, updated.a, params.mu);
  const { a, e } = updated;
  return { ...el, a, e, period: Number.isFinite(period) && period > 0 ? period : el.period };
}

function canApplyTidalEvolution(tides: TidalEvolutionInputs["tides"], dtSec: number): boolean {
  return Boolean(tides?.enabled) && Number.isFinite(dtSec) && dtSec !== 0;
}

function resolveTidalDrift(el: OrbitElements, params: TidalEvolutionInputs): TidalDrift {
  const explicit = explicitTidalDrift(params.tides);
  if (explicit.daDt !== 0 || explicit.deDt !== 0) return explicit;
  return derivedTidalDrift(el, params);
}

function explicitTidalDrift(tides: TidalEvolutionInputs["tides"]): TidalDrift {
  return {
    daDt: Number.isFinite(tides?.daDt) ? tides!.daDt! : 0,
    deDt: Number.isFinite(tides?.deDt) ? tides!.deDt! : 0,
  };
}

function sanitizeTidalDrift(drift: TidalDrift): TidalDrift {
  return {
    daDt: Number.isFinite(drift.daDt) ? drift.daDt : 0,
    deDt: Number.isFinite(drift.deDt) ? drift.deDt : 0,
  };
}

function derivedTidalDrift(el: OrbitElements, params: TidalEvolutionInputs): TidalDrift {
  const { k2, Q } = params.tides ?? {};
  const { centralRadius: R, mu } = params;
  if (!hasDerivedTidalInputs(el, R, mu, k2, Q)) return { daDt: 0, deDt: 0 };

  const n = Math.sqrt((mu as number) / (el.a * el.a * el.a));
  // Goldreich & Soter (1966) prefactors: 21/2 for both da/dt and de/dt.
  // da/dt = -(21) * (k2/Q) * (R/a)^5 * n * a * e^2
  // de/dt = -(21/2) * (k2/Q) * (R/a)^5 * n * e
  const s = ((k2 as number) / (Q as number)) * Math.pow((R as number) / el.a, 5) * n;

  return {
    deDt: -(21 / 2) * s * el.e,
    daDt: -21 * s * el.a * el.e * el.e,
  };
}

function hasDerivedTidalInputs(
  el: OrbitElements,
  R: number | undefined,
  mu: number | undefined,
  k2: number | undefined,
  Q: number | undefined,
): boolean {
  return hasValidTidalCoefficients(k2, Q) && hasValidTidalCentralInputs(R, mu) && hasValidTidalOrbit(el);
}

function hasValidTidalCoefficients(k2: number | undefined, Q: number | undefined): boolean {
  return isFinitePositive(k2) && isFinitePositive(Q);
}

function hasValidTidalCentralInputs(R: number | undefined, mu: number | undefined): boolean {
  return isFinitePositive(R) && isFinitePositive(mu);
}

function hasValidTidalOrbit(el: OrbitElements): boolean {
  return isFinitePositive(el.a) && Number.isFinite(el.e) && el.e >= 0 && el.e < 1;
}

function applyTidalDrift(el: OrbitElements, dtSec: number, drift: TidalDrift): TidalOrbitUpdate {
  return {
    a: Math.max(1e-6, el.a + drift.daDt * dtSec),
    e: Math.min(MAX_ECC_NEAR_PARABOLIC, Math.max(0, el.e + drift.deDt * dtSec)),
  };
}

const clampTidalStep = (el: OrbitElements, dtSec: number, update: TidalOrbitUpdate): TidalOrbitUpdate => {
  return {
    a: clampTidalAxis(el, dtSec, update.a),
    e: clampTidalEccentricity(el, dtSec, update.e),
  };
};

const clampTidalAxis = (el: OrbitElements, dtSec: number, a: number): number => {
  const MAX_REL_CHANGE = 0.5;
  const relDaRaw = Math.abs(a - el.a) / Math.max(el.a, 1e-15);
  if (relDaRaw <= MAX_REL_CHANGE) return a;

  const sign = a >= el.a ? 1 : -1;
  console.warn(
    `applyTidalSecularEvolution: clamped da/a from ${relDaRaw.toFixed(4)} to ${MAX_REL_CHANGE}. ` +
      `dtSec=${dtSec.toExponential(3)} is too large for stable tidal evolution.`,
  );
  return Math.max(1e-6, el.a * (1 + sign * MAX_REL_CHANGE));
};

const clampTidalEccentricity = (el: OrbitElements, dtSec: number, e: number): number => {
  const MAX_REL_CHANGE = 0.5;
  const relDeRaw = relativeEccentricityChange(el, e);
  if (relDeRaw <= MAX_REL_CHANGE || el.e <= 1e-12) return e;

  const sign = e >= el.e ? 1 : -1;
  console.warn(
    `applyTidalSecularEvolution: clamped de/e from ${relDeRaw.toFixed(4)} to ${MAX_REL_CHANGE}. ` +
      `dtSec=${dtSec.toExponential(3)} is too large for stable tidal evolution.`,
  );
  return Math.min(MAX_ECC_NEAR_PARABOLIC, Math.max(0, el.e * (1 + sign * MAX_REL_CHANGE)));
};

const warnLargeTidalChange = (el: OrbitElements, update: TidalOrbitUpdate): void => {
  const relDa = Math.abs(update.a - el.a) / Math.max(el.a, 1e-15);
  const relDe = relativeEccentricityChange(el, update.e);
  if (relDa <= 0.1 && relDe <= 0.1) return;

  console.warn(
    `applyTidalSecularEvolution: large secular change detected (da/a=${relDa.toFixed(4)}, de/e=${relDe.toFixed(4)}). ` +
      `Consider reducing the time step or clamping tidal parameters.`,
  );
};

const relativeEccentricityChange = (el: OrbitElements, e: number): number => {
  return el.e > 1e-12 ? Math.abs(e - el.e) / el.e : Math.abs(e - el.e);
};

const resolveTidalPeriod = (el: OrbitElements, a: number, mu: number | undefined): number => {
  const muEff = isFinitePositive(mu) ? mu : deriveMuFromOrbit(el);
  return isFinitePositive(muEff) ? 2 * Math.PI * Math.sqrt((a * a * a) / muEff) : el.period;
};

const deriveMuFromOrbit = (el: OrbitElements): number | undefined => {
  if (!(Number.isFinite(el.period) && el.period > 0 && Number.isFinite(el.a) && el.a > 0)) return undefined;

  const n0 = (2 * Math.PI) / el.period;
  return n0 * n0 * el.a * el.a * el.a;
};

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
  const moon = resolveMoonForState(params, t);
  if (!moon) return undefined;

  const exo = getExomoonConfig(params);
  const driftY = computeMoonSkyDriftY(exo, t);
  const rBary = moonBarycenterPosition(params, t, rBaryOverride);
  const moonOrbitRel = moonOrbitForState(params, t, exo, relativity);
  if (!moonOrbitRel) return undefined;

  const rMoonRel = posFromResolvedElements(moonOrbitRel, t, "moon.orbitAroundPlanet");
  const { rPlanetAbs, rMoonAbsBase } = moonAbsolutePositions(params, moon, rBary, rMoonRel);
  const rMoonAbs = applyMoonSkyDrift(rMoonAbsBase, observerDir, driftY);
  const moonSky = projectToSky(rMoonAbs, observerDir);

  return { rBary, rPlanetAbs, rMoonAbs, rMoonRel, moonSky, driftY };
}

function resolveMoonForState(params: SystemParams, t: number): MoonParams | undefined {
  if (!params.moon) return undefined;
  if (!Number.isFinite(t)) throw new Error("getMoonStateAt: t must be finite.");
  if (!Number.isFinite(params.moon.r) || params.moon.r <= 0) {
    throw new Error("getMoonStateAt: moon.r must be > 0.");
  }
  return params.moon;
}

function moonBarycenterPosition(params: SystemParams, t: number, rBaryOverride: Vec3 | undefined): Vec3 {
  // Planet "orbit" is interpreted as barycenter orbit if a valid planet+moon mass pair exists.
  // Otherwise it is treated as the planet orbit directly, and the moon is placed relative to it.
  // OPTIMIZATION: Use rBaryOverride if provided to avoid re-calculating Kepler orbit.
  return (
    rBaryOverride ??
    posFromResolvedElements(resolvePlanetOrbitForKinematics(params, t, "planet.orbit"), t, "planet.orbit")
  );
}

function moonOrbitForState(
  params: SystemParams,
  t: number,
  exo: ExomoonTimingShapeParams | undefined,
  relativity: NormalizedRelativityParams | undefined,
): OrbitElements | undefined {
  const moonOrbitBaseEl = resolveMoonOrbitForKinematics(params, t, "moon.orbitAroundPlanet");
  if (!moonOrbitBaseEl) return undefined;

  return applyMoonRelativityPrecession(applyMoonOrientationEvolution(moonOrbitBaseEl, t, exo), t, relativity);
}

function applyMoonOrientationEvolution(
  moonOrbitBaseEl: OrbitElements,
  t: number,
  exo: ExomoonTimingShapeParams | undefined,
): OrbitElements {
  if (!exo?.enabled) return moonOrbitBaseEl;

  return applyOrientationEvolution(moonOrbitBaseEl, t, {
    enabled: true,
    tRef: toFiniteNumber(exo.tRef, 0),
    OmegaDot: exo.moonOmegaDot,
    incDot: exo.moonIncDot,
    omegaDot: exo.moonOmegaSmallDot,
    Omega0: exo.moonOmega0,
    inc0: exo.moonInc0,
    omega0: exo.moonOmegaSmall0,
    wrapAngles: "2pi",
    clampInc01Pi: true,
  });
}

function applyMoonRelativityPrecession(
  moonOrbitEvolvedEl: OrbitElements,
  t: number,
  relativity: NormalizedRelativityParams | undefined,
): OrbitElements {
  if (!relativity?.enabled || !relativity.grPrecession) return moonOrbitEvolvedEl;

  const moonPrec = resolveGrPrecessionPerOrbit({
    orbit: moonOrbitEvolvedEl,
    c: relativity.c,
    override: relativity.moonPrecessionPerOrbit,
  });

  return applyApsidalPrecession(moonOrbitEvolvedEl, t, moonPrec);
}

function moonAbsolutePositions(
  params: SystemParams,
  moon: MoonParams,
  rBary: Vec3,
  rMoonRel: Vec3,
): MoonAbsolutePositions {
  const split = trySplitBarycentricPair({
    rBary,
    rRel: rMoonRel, // vector from planet -> moon
    mPrimary: params.planet.m,
    mSecondary: moon.m,
  });

  return {
    rPlanetAbs: split ? split.rPrimary : rBary,
    rMoonAbsBase: split ? split.rSecondary : vAdd(rBary, rMoonRel),
  };
}

function applyMoonSkyDrift(rMoonAbsBase: Vec3, observerDir: Vec3, driftY: number): Vec3 {
  if (driftY === 0) return rMoonAbsBase;

  const { ey } = buildSkyBasis(observerDir);
  return vAddScaled(rMoonAbsBase, ey, driftY);
}
