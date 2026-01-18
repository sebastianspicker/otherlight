// src/experimental/physics/nbody.ts

//
// Minimal, scientifically correct Newtonian N-body utilities for the specific
// star–planet–moon system in this codebase, including star reflex motion and
// optional perturbers. Legacy star-fixed helpers remain for diagnostics.
//
// Scope and conventions
// - Star, planet, moon, and optional perturbers are integrated dynamically.
// - Positions/velocities are inertial (barycentric) unless noted otherwise.
//
// Units
// - Project uses arbitrary but self-consistent simulation units.
// - Gravitational parameters must be provided as mu = G*M with units (L^3 / T^2).
//
// Numerical method
// - Velocity-Verlet (Kick–Drift–Kick / Leapfrog) integrator.
//
// Softening
// - Optional Plummer softening length eps >= 0:
//   1/|r|^3 -> 1/(|r|^2 + eps^2)^(3/2)

import type { Vec3 } from "../../physics/vec3";
import {
  VEC3ZERO,
  vAdd,
  vAddScaled,
  vIsFinite,
  vLen,
  vLenSq,
  vScale,
  vSub,
} from "../../physics/vec3";

export type NBodyPerturberState = {
  r: Vec3;
  v: Vec3;
};

export type NBodyState = {
  /** State time in seconds. */
  t: number;
  /** Star inertial position and velocity. */
  rS: Vec3;
  vS: Vec3;
  /** Planet inertial position and velocity. */
  rP: Vec3;
  vP: Vec3;
  /** Moon inertial position and velocity. */
  rM: Vec3;
  vM: Vec3;
  /** Optional perturbers in inertial coordinates. */
  perturbers: NBodyPerturberState[];
};

export type NBodyStepParams = {
  state: NBodyState;

  /** Timestep [s]. May be positive or negative. */
  dt: number;

  /** Gravitational parameter of the star: muStar = G*Mstar. Must be > 0. */
  muStar: number;

  /** Gravitational parameter of the planet: muPlanet = G*Mplanet. Must be > 0. */
  muPlanet: number;

  /** Gravitational parameter of the moon: muMoon = G*Mmoon. Must be > 0. */
  muMoon: number;

  /** Optional perturber gravitational parameters mu = G*M. */
  muPerturbers?: number[];

  /** Optional Plummer-style softening length eps [L]. Default: 0. */
  softening?: number;

  /**
   * Debug/diagnostics:
   * - If true, throw when two bodies overlap with zero softening (undefined Newtonian accel).
   * - If false/omitted, preserve fail-open behavior (return zero accel deterministically).
   */
  throwOnOverlap?: boolean;
};

function assertFiniteNumber(x: unknown, name: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x))
    throw new Error(`${name} must be a finite number.`);
}

function assertMu(mu: unknown, name: string): asserts mu is number {
  assertFiniteNumber(mu, name);
  if (mu <= 0) throw new Error(`${name} must be > 0.`);
}

function assertFiniteVec3(v: unknown, name: string): asserts v is Vec3 {
  if (!v || typeof v !== "object") throw new Error(`${name} must be a Vec3.`);
  if (!vIsFinite(v as Vec3))
    throw new Error(`${name} must be finite (no NaN/inf).`);
}

function normalizeSoftening(softening: unknown): { eps: number; eps2: number } {
  const eps =
    typeof softening === "number" && Number.isFinite(softening)
      ? Math.max(0, softening)
      : 0;
  return { eps, eps2: eps * eps };
}

/**
 * Acceleration at rSelf due to a point mass at rSrc with gravitational parameter muSrc:
 * a = muSrc * (rSrc - rSelf) / |rSrc - rSelf|^3
 *
 * With Plummer softening:
 * a = muSrc * dr / (|dr|^2 + eps^2)^(3/2)
 */
function accelFromPointMass(params: {
  rSelf: Vec3;
  rSrc: Vec3;
  muSrc: number;
  eps2: number;
  throwOnOverlap?: boolean;
}): Vec3 {
  const { rSelf, rSrc, muSrc, eps2, throwOnOverlap } = params;

  const dr = vSub(rSrc, rSelf);
  const r2 = vLenSq(dr);

  // Overlap / non-finite: Newtonian acceleration undefined when eps2===0.
  if (!(r2 > 0) || !Number.isFinite(r2)) {
    if ((throwOnOverlap ?? false) && eps2 === 0) {
      throw new Error(
        "accelFromPointMass: overlap detected with zero softening (check dt, initial conditions, or add softening)."
      );
    }
    // Deterministic fail-open behavior (legacy-friendly).
    return VEC3ZERO;
  }

  const d2 = r2 + eps2;
  if (!(d2 > 0) || !Number.isFinite(d2)) {
    if (throwOnOverlap ?? false) {
      throw new Error(
        "accelFromPointMass: invalid squared distance (non-finite)."
      );
    }
    return VEC3ZERO;
  }

  const invR = 1 / Math.sqrt(d2);
  const invR3 = invR * invR * invR;

  return vScale(dr, muSrc * invR3);
}

/**
 * Legacy helper: accelerations for planet and moon with star fixed at the origin.
 * (Use integrateNBodyStep for full star-reflex dynamics.)
 */
export function accelerationsStarPlanetMoon(params: {
  rP: Vec3;
  rM: Vec3;
  muStar: number;
  muPlanet: number;
  muMoon: number;
  softening?: number;
  throwOnOverlap?: boolean;
}): { aP: Vec3; aM: Vec3 } {
  const { rP, rM, muStar, muPlanet, muMoon } = params;
  assertFiniteVec3(rP, "rP");
  assertFiniteVec3(rM, "rM");
  assertMu(muStar, "muStar");
  assertMu(muPlanet, "muPlanet");
  assertMu(muMoon, "muMoon");

  const { eps2 } = normalizeSoftening(params.softening);
  const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

  // Planet: star + moon
  const aP_star = accelFromPointMass({
    rSelf: rP,
    rSrc: ORIGIN,
    muSrc: muStar,
    eps2,
    throwOnOverlap: params.throwOnOverlap,
  });
  const aP_moon = accelFromPointMass({
    rSelf: rP,
    rSrc: rM,
    muSrc: muMoon,
    eps2,
    throwOnOverlap: params.throwOnOverlap,
  });
  const aP = vAdd(aP_star, aP_moon);

  // Moon: star + planet
  const aM_star = accelFromPointMass({
    rSelf: rM,
    rSrc: ORIGIN,
    muSrc: muStar,
    eps2,
    throwOnOverlap: params.throwOnOverlap,
  });
  const aM_planet = accelFromPointMass({
    rSelf: rM,
    rSrc: rP,
    muSrc: muPlanet,
    eps2,
    throwOnOverlap: params.throwOnOverlap,
  });
  const aM = vAdd(aM_star, aM_planet);

  return { aP, aM };
}

type NBodyBody = { r: Vec3; v: Vec3; mu: number };

function buildBodiesFromState(params: {
  state: NBodyState;
  muStar: number;
  muPlanet: number;
  muMoon: number;
  muPerturbers: number[];
}): NBodyBody[] {
  const { state, muStar, muPlanet, muMoon, muPerturbers } = params;

  const pert = state.perturbers ?? [];
  if (pert.length !== muPerturbers.length) {
    throw new Error(
      `perturber count mismatch: state has ${pert.length}, muPerturbers has ${muPerturbers.length}.`
    );
  }

  const bodies: NBodyBody[] = [
    { r: state.rS, v: state.vS, mu: muStar },
    { r: state.rP, v: state.vP, mu: muPlanet },
    { r: state.rM, v: state.vM, mu: muMoon },
  ];

  for (let i = 0; i < pert.length; i++) {
    bodies.push({ r: pert[i].r, v: pert[i].v, mu: muPerturbers[i] });
  }

  return bodies;
}

function unpackBodiesToState(params: {
  t: number;
  bodies: NBodyBody[];
  perturberCount: number;
}): NBodyState {
  const { t, bodies, perturberCount } = params;
  if (bodies.length < 3) throw new Error("N-body requires star, planet, moon bodies.");

  const pertStart = 3;
  const pertEnd = pertStart + perturberCount;
  if (bodies.length !== pertEnd) {
    throw new Error("N-body body count mismatch when unpacking.");
  }

  const pert: NBodyPerturberState[] = [];
  for (let i = pertStart; i < pertEnd; i++) {
    pert.push({ r: bodies[i].r, v: bodies[i].v });
  }

  return {
    t,
    rS: bodies[0].r,
    vS: bodies[0].v,
    rP: bodies[1].r,
    vP: bodies[1].v,
    rM: bodies[2].r,
    vM: bodies[2].v,
    perturbers: pert,
  };
}

function computeAccelerations(params: {
  bodies: NBodyBody[];
  eps2: number;
  throwOnOverlap?: boolean;
}): Vec3[] {
  const { bodies, eps2, throwOnOverlap } = params;
  const acc: Vec3[] = bodies.map(() => ({ x: 0, y: 0, z: 0 }));

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const ri = bodies[i].r;
      const rj = bodies[j].r;
      const dr = vSub(rj, ri);
      const r2 = vLenSq(dr);

      if (!(r2 > 0) || !Number.isFinite(r2)) {
        if ((throwOnOverlap ?? false) && eps2 === 0) {
          throw new Error(
            "nbody accel: overlap detected with zero softening (check dt, initial conditions, or add softening)."
          );
        }
        continue;
      }

      const d2 = r2 + eps2;
      if (!(d2 > 0) || !Number.isFinite(d2)) {
        if (throwOnOverlap ?? false) {
          throw new Error("nbody accel: invalid squared distance (non-finite).");
        }
        continue;
      }

      const invR = 1 / Math.sqrt(d2);
      const invR3 = invR * invR * invR;

      const muI = bodies[i].mu;
      const muJ = bodies[j].mu;

      acc[i] = vAdd(acc[i], vScale(dr, muJ * invR3));
      acc[j] = vAdd(acc[j], vScale(dr, -muI * invR3));
    }
  }

  return acc;
}

/** Advance the full N-body system by one Velocity-Verlet step. */
export function integrateNBodyStep(params: NBodyStepParams): NBodyState {
  const { state, dt, muStar, muPlanet, muMoon } = params;

  if (!state) throw new Error("state must be provided.");
  assertFiniteNumber(state.t, "state.t");
  assertFiniteVec3(state.rS, "state.rS");
  assertFiniteVec3(state.vS, "state.vS");
  assertFiniteVec3(state.rP, "state.rP");
  assertFiniteVec3(state.vP, "state.vP");
  assertFiniteVec3(state.rM, "state.rM");
  assertFiniteVec3(state.vM, "state.vM");
  assertFiniteNumber(dt, "dt");

  if (dt === 0) return state;

  assertMu(muStar, "muStar");
  assertMu(muPlanet, "muPlanet");
  assertMu(muMoon, "muMoon");

  const muPerturbers = Array.isArray(params.muPerturbers)
    ? params.muPerturbers
    : [];
  for (let i = 0; i < muPerturbers.length; i++) {
    assertMu(muPerturbers[i], `muPerturbers[${i}]`);
  }
  if (Array.isArray(state.perturbers)) {
    for (let i = 0; i < state.perturbers.length; i++) {
      assertFiniteVec3(state.perturbers[i].r, `state.perturbers[${i}].r`);
      assertFiniteVec3(state.perturbers[i].v, `state.perturbers[${i}].v`);
    }
  }

  const { eps2 } = normalizeSoftening(params.softening);
  const bodies0 = buildBodiesFromState({
    state,
    muStar,
    muPlanet,
    muMoon,
    muPerturbers,
  });

  const a0 = computeAccelerations({
    bodies: bodies0,
    eps2,
    throwOnOverlap: params.throwOnOverlap,
  });

  const dt2 = dt * dt;
  const bodies1: NBodyBody[] = bodies0.map((b, i) => ({
    r: vAdd(vAddScaled(b.r, b.v, dt), vScale(a0[i], 0.5 * dt2)),
    v: b.v,
    mu: b.mu,
  }));

  const a1 = computeAccelerations({
    bodies: bodies1,
    eps2,
    throwOnOverlap: params.throwOnOverlap,
  });

  const bodiesOut: NBodyBody[] = bodies0.map((b, i) => ({
    r: bodies1[i].r,
    v: vAdd(b.v, vScale(vAdd(a0[i], a1[i]), 0.5 * dt)),
    mu: b.mu,
  }));

  const out = unpackBodiesToState({
    t: state.t + dt,
    bodies: bodiesOut,
    perturberCount: muPerturbers.length,
  });

  if (
    !Number.isFinite(out.t) ||
    !vIsFinite(out.rS) ||
    !vIsFinite(out.vS) ||
    !vIsFinite(out.rP) ||
    !vIsFinite(out.vP) ||
    !vIsFinite(out.rM) ||
    !vIsFinite(out.vM)
  ) {
    throw new Error(
      "integrateNBodyStep produced non-finite state (dt too large or parameters pathological)."
    );
  }

  if (out.perturbers.length !== muPerturbers.length) {
    throw new Error("integrateNBodyStep: perturber count mismatch.");
  }

  for (let i = 0; i < out.perturbers.length; i++) {
    if (!vIsFinite(out.perturbers[i].r) || !vIsFinite(out.perturbers[i].v)) {
      throw new Error(
        "integrateNBodyStep produced non-finite perturber state."
      );
    }
  }

  return out;
}

/** Advance the star–planet–moon system by one Velocity-Verlet step. */
export function integratePlanetMoon3BodyStep(
  params: NBodyStepParams
): NBodyState {
  if (Array.isArray(params.muPerturbers) && params.muPerturbers.length > 0) {
    throw new Error(
      "integratePlanetMoon3BodyStep does not accept perturbers; use integrateNBodyStep."
    );
  }
  if (params.state.perturbers.length > 0) {
    throw new Error(
      "integratePlanetMoon3BodyStep does not accept perturber states; use integrateNBodyStep."
    );
  }

  return integrateNBodyStep({ ...params, muPerturbers: [] });
}

/**
 * Deterministic multi-step integration from state.t toward target time tTarget,
 * using substeps with |dt| <= dtMaxAbs (full N-body).
 */
export function integrateToTime(params: {
  state: NBodyState;
  tTarget: number;
  dtMaxAbs: number;
  muStar: number;
  muPlanet: number;
  muMoon: number;
  muPerturbers?: number[];
  softening?: number;
  /** If true, land exactly on tTarget. Default: true. */
  exactFinalStep?: boolean;
  /** Safety cap for number of substeps. Default: 2e6. */
  maxSteps?: number;
  /** Debug/diagnostics: see integratePlanetMoon3BodyStep. */
  throwOnOverlap?: boolean;
}): NBodyState {
  const { state, tTarget, muStar, muPlanet, muMoon } = params;

  if (!state) throw new Error("state must be provided.");
  assertFiniteNumber(tTarget, "tTarget");
  assertFiniteNumber(params.dtMaxAbs, "dtMaxAbs");
  assertMu(muStar, "muStar");
  assertMu(muPlanet, "muPlanet");
  assertMu(muMoon, "muMoon");
  if (Array.isArray(params.muPerturbers)) {
    for (let i = 0; i < params.muPerturbers.length; i++) {
      assertMu(params.muPerturbers[i], `muPerturbers[${i}]`);
    }
  }

  const dtMaxAbs = Math.max(0, params.dtMaxAbs);
  if (dtMaxAbs === 0) throw new Error("dtMaxAbs must be > 0.");

  const exactFinalStep = params.exactFinalStep ?? true;
  const maxSteps = Number.isFinite(params.maxSteps)
    ? Math.max(1, Math.floor(params.maxSteps!))
    : 2_000_000;

  let s = state;
  for (let steps = 0; steps < maxSteps; steps++) {
    const remaining = tTarget - s.t;
    if (remaining === 0) return s;

    if (!exactFinalStep && Math.abs(remaining) < dtMaxAbs) return s;

    const dir = Math.sign(remaining);
    const dtStepMag = Math.min(dtMaxAbs, Math.abs(remaining));
    const dt = dir * dtStepMag;

    s = integrateNBodyStep({
      state: s,
      dt,
      muStar,
      muPlanet,
      muMoon,
      muPerturbers: params.muPerturbers,
      softening: params.softening,
      throwOnOverlap: params.throwOnOverlap,
    });
  }

  throw new Error(
    "integrateToTime exceeded maxSteps (check dtMaxAbs or target time)."
  );
}

/**
 * Barycenter of planet+moon (for diagnostics):
 * rB = (muP*rP + muM*rM) / (muP + muM)
 *
 * Valid because mu ∝ M when mu = G*M with a shared G.
 */
export function planetMoonBarycenter(params: {
  rP: Vec3;
  rM: Vec3;
  muPlanet: number;
  muMoon: number;
}): Vec3 {
  const { rP, rM, muPlanet, muMoon } = params;
  assertFiniteVec3(rP, "rP");
  assertFiniteVec3(rM, "rM");
  assertMu(muPlanet, "muPlanet");
  assertMu(muMoon, "muMoon");

  const muTot = muPlanet + muMoon;
  if (!Number.isFinite(muTot) || muTot <= 0)
    throw new Error("muPlanet + muMoon must be finite and > 0.");

  const wP = muPlanet / muTot;
  const wM = muMoon / muTot;

  return vAddScaled(vScale(rP, wP), rM, wM);
}

/**
 * Specific two-body orbital energy (per unit mass) relative to the star:
 * eps = v^2/2 - muStar/r
 */
export function specificEnergyTwoBody(params: {
  r: Vec3;
  v: Vec3;
  muStar: number;
}): number {
  const { r, v, muStar } = params;
  assertFiniteVec3(r, "r");
  assertFiniteVec3(v, "v");
  assertMu(muStar, "muStar");

  const rr = vLen(r);
  const vv2 = vLenSq(v);

  if (!(rr > 0) || !Number.isFinite(rr)) return Number.NaN;

  const eps = 0.5 * vv2 - muStar / rr;
  return Number.isFinite(eps) ? eps : Number.NaN;
}

/**
 * Total mechanical energy (star fixed) of the planet+moon system.
 *
 * Because we store mu = G*M (not masses), the planet–moon mutual potential term cannot be written
 * solely in mu's without also knowing G (or masses separately). Therefore this helper returns NaN
 * unless mPlanet, mMoon, and G are provided.
 */
export function totalEnergyStarFixedIfMassesProvided(params: {
  rP: Vec3;
  vP: Vec3;
  rM: Vec3;
  vM: Vec3;
  muStar: number;
  mPlanet?: number;
  mMoon?: number;
  G?: number;
}): number {
  const { rP, vP, rM, vM, muStar } = params;
  assertFiniteVec3(rP, "rP");
  assertFiniteVec3(vP, "vP");
  assertFiniteVec3(rM, "rM");
  assertFiniteVec3(vM, "vM");
  assertMu(muStar, "muStar");

  const mP = params.mPlanet;
  const mM = params.mMoon;
  const G = params.G;

  if (!(typeof mP === "number" && Number.isFinite(mP) && mP > 0))
    return Number.NaN;
  if (!(typeof mM === "number" && Number.isFinite(mM) && mM > 0))
    return Number.NaN;
  if (!(typeof G === "number" && Number.isFinite(G) && G > 0))
    return Number.NaN;

  const rPmag = vLen(rP);
  const rMmag = vLen(rM);
  const rPMmag = vLen(vSub(rM, rP));

  if (!(rPmag > 0) || !(rMmag > 0) || !(rPMmag > 0)) return Number.NaN;

  const vP2 = vLenSq(vP);
  const vM2 = vLenSq(vM);

  const T = 0.5 * mP * vP2 + 0.5 * mM * vM2;

  // muStar = G*Mstar => Mstar = muStar/G
  const Mstar = muStar / G;

  const Ustar = -G * (mP * Mstar / rPmag + mM * Mstar / rMmag);
  const Upm = -G * (mP * mM) / rPMmag;

  const E = T + Ustar + Upm;
  return Number.isFinite(E) ? E : Number.NaN;
}

export type NBodyPlanetMoonParamsLike = {
  enabled?: boolean;
  muStar?: number;
  muPlanet?: number;
  muMoon?: number;
  dtMax?: number;
  softening?: number;
  throwOnOverlap?: boolean;
};

function isFinitePositiveNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

/**
 * Resolve N-body config in a way that avoids "late throws" inside the integrator.
 *
 * Policy:
 * - If cfg.enabled is not true => return null (treat as disabled).
 * - If cfg.enabled is true but required fields are missing/invalid =>
 *   - onInvalid="throw": throw a clear configuration error (recommended for strict builds)
 *   - onInvalid="disable": return null (fail-open UI)
 */
export function resolveEnabledNBodyPlanetMoonConfig(
  cfg: NBodyPlanetMoonParamsLike | undefined,
  opts?: { onInvalid?: "throw" | "disable"; defaultDtMaxAbs?: number }
): {
  muStar: number;
  muPlanet: number;
  muMoon: number;
  dtMaxAbs: number;
  softening: number;
  throwOnOverlap: boolean;
} | null {
  if (!cfg || cfg.enabled !== true) return null;

  const onInvalid = opts?.onInvalid ?? "throw";
  const bad = (msg: string): null => {
    if (onInvalid === "throw")
      throw new Error(`N-body enabled but configuration invalid: ${msg}`);
    return null;
  };

  if (!isFinitePositiveNumber(cfg.muStar))
    return bad("muStar must be set and > 0.");
  if (!isFinitePositiveNumber(cfg.muPlanet))
    return bad("muPlanet must be set and > 0.");
  if (!isFinitePositiveNumber(cfg.muMoon))
    return bad("muMoon must be set and > 0.");

  const dtMaxAbsRaw = cfg.dtMax ?? opts?.defaultDtMaxAbs;
  if (!isFinitePositiveNumber(dtMaxAbsRaw))
    return bad("dtMax must be set and > 0.");

  const softening =
    typeof cfg.softening === "number" && Number.isFinite(cfg.softening)
      ? Math.max(0, cfg.softening)
      : 0;
  const throwOnOverlap = Boolean(cfg.throwOnOverlap);

  return {
    muStar: cfg.muStar,
    muPlanet: cfg.muPlanet,
    muMoon: cfg.muMoon,
    dtMaxAbs: dtMaxAbsRaw,
    softening,
    throwOnOverlap,
  };
}
