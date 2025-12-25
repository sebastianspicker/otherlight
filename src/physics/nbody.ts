// src/physics/nbody.ts
//
// Minimal, scientifically correct Newtonian N-body utilities for the specific
// star–planet–moon problem in this codebase.
//
// Scope and conventions
// - Star is treated as a fixed point mass at the origin (0,0,0).
//   This is a common approximation for transit photometry geometry; it ignores
//   stellar reflex motion (can be modeled separately if desired).
// - Planet and Moon are integrated dynamically with:
//   - stellar gravity,
//   - mutual planet–moon gravity.
// - This is a restricted “3-body” setup (star fixed), not a full N-body solver.
//
// Units
// - Project uses arbitrary but self-consistent simulation units.
// - Gravitational parameters must be provided as mu = G*M with units (L^3 / T^2).
//
// IMPORTANT mu-consistency policy
// - muStar/muPlanet/muMoon are interpreted strictly as gravitational parameters (G*M).
// - If other parts of the app use Body.m as “mass-like” in arbitrary units (ratios only),
//   do NOT pass Body.m directly as mu unless you also define/assume G=1 and that Body.m is M.
// - In this repo, SystemParams.dynamics.nbodyPlanetMoon provides explicit mu values; use those.
//
// Numerical method
// - Velocity-Verlet (Kick–Drift–Kick / Leapfrog) integrator.
//   - Symplectic and time-reversible for constant dt.
//   - For variable dt, substepping (bounded dtMax) is recommended; strict symplecticity is lost,
//     but behavior remains robust.
//
// Stability / dtMax guidance (practical)
// - dtMax should be small compared to the shortest dynamical timescale (typically moon period).
//   As a rough interactive guideline, dtMax ≲ P_moon / 200 is often reasonable.
// - Large dt leads to phase error and can cause large energy drift, especially near close encounters.
//
// Softening
// - Optional Plummer softening length eps >= 0:
//   1/|r|^3 -> 1/(|r|^2 + eps^2)^(3/2)
// - Softening is a numerical safeguard for pathological UI states (overlaps), not physical.
//
// Integration style
// - integratePlanetMoon3BodyStep: one integrator step by dt.
// - integrateToTime: deterministic substepping toward a target time using |dt| <= dtMaxAbs.
// - Energy helpers are provided for debugging drift.

import type { Vec3 } from "./vec3";
import {
  VEC3ZERO,
  vAdd,
  vAddScaled,
  vIsFinite,
  vLen,
  vLenSq,
  vScale,
  vSub,
} from "./vec3";

export type NBodyState2 = {
  /** State time in seconds. */
  t: number;

  /** Planet inertial position and velocity relative to the star (origin). */
  rP: Vec3;
  vP: Vec3;

  /** Moon inertial position and velocity relative to the star (origin). */
  rM: Vec3;
  vM: Vec3;
};

export type NBodyStepParams2 = {
  state: NBodyState2;

  /**
   * Timestep [s]. May be positive or negative.
   * For best long-term behavior keep dt constant; if dt varies, prefer substepping.
   */
  dt: number;

  /** Gravitational parameter of the star: muStar = G*Mstar. Must be > 0. */
  muStar: number;

  /** Gravitational parameter of the planet: muPlanet = G*Mplanet. Must be > 0. */
  muPlanet: number;

  /** Gravitational parameter of the moon: muMoon = G*Mmoon. Must be > 0. */
  muMoon: number;

  /**
   * Optional Plummer-style softening length eps [L].
   * Default: 0 (no softening).
   */
  softening?: number;
};

function assertFiniteNumber(x: unknown, name: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x)) throw new Error(`${name} must be a finite number.`);
}

function assertMu(mu: unknown, name: string): asserts mu is number {
  assertFiniteNumber(mu, name);
  if (mu <= 0) throw new Error(`${name} must be > 0.`);
}

function assertFiniteVec3(v: unknown, name: string): asserts v is Vec3 {
  if (!v || typeof v !== "object") throw new Error(`${name} must be a Vec3.`);
  if (!vIsFinite(v as Vec3)) throw new Error(`${name} must be finite (no NaN/inf).`);
}

function normalizeSoftening(softening: unknown): { eps: number; eps2: number } {
  const eps = typeof softening === "number" && Number.isFinite(softening) ? Math.max(0, softening) : 0;
  return { eps, eps2: eps * eps };
}

/**
 * Acceleration at rSelf due to a point mass at rSrc with gravitational parameter muSrc:
 *   a = muSrc * (rSrc - rSelf) / |rSrc - rSelf|^3
 *
 * With Plummer softening (eps^2 added):
 *   a = muSrc * dr / (|dr|^2 + eps^2)^(3/2)
 */
function accelFromPointMass(params: { rSelf: Vec3; rSrc: Vec3; muSrc: number; eps2: number }): Vec3 {
  const { rSelf, rSrc, muSrc, eps2 } = params;

  const dr = vSub(rSrc, rSelf);
  const d2 = vLenSq(dr) + eps2;

  // If overlap and no softening, acceleration is undefined; return 0 deterministically.
  if (!(d2 > 0) || !Number.isFinite(d2)) return VEC3ZERO;

  const invR = 1 / Math.sqrt(d2);
  const invR3 = invR * invR * invR;
  return vScale(dr, muSrc * invR3);
}

/**
 * Compute accelerations for planet and moon under:
 * - Stellar gravity (star at origin)
 * - Mutual planet–moon gravity
 *
 * Star is fixed, so no back-reaction on the star is computed.
 */
export function accelerationsStarPlanetMoon(params: {
  rP: Vec3;
  rM: Vec3;
  muStar: number;
  muPlanet: number;
  muMoon: number;
  softening?: number;
}): { aP: Vec3; aM: Vec3 } {
  const { rP, rM, muStar, muPlanet, muMoon } = params;

  assertFiniteVec3(rP, "rP");
  assertFiniteVec3(rM, "rM");
  assertMu(muStar, "muStar");
  assertMu(muPlanet, "muPlanet");
  assertMu(muMoon, "muMoon");

  const { eps2 } = normalizeSoftening(params.softening);
  const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

  // Planet: star + moon.
  const aP_star = accelFromPointMass({ rSelf: rP, rSrc: ORIGIN, muSrc: muStar, eps2 });
  const aP_moon = accelFromPointMass({ rSelf: rP, rSrc: rM, muSrc: muMoon, eps2 });
  const aP = vAdd(aP_star, aP_moon);

  // Moon: star + planet.
  const aM_star = accelFromPointMass({ rSelf: rM, rSrc: ORIGIN, muSrc: muStar, eps2 });
  const aM_planet = accelFromPointMass({ rSelf: rM, rSrc: rP, muSrc: muPlanet, eps2 });
  const aM = vAdd(aM_star, aM_planet);

  return { aP, aM };
}

/**
 * Advance the star–planet–moon system by one Velocity-Verlet step.
 *
 * Notes on stability:
 * - For constant dt and eps=0 (no softening), this is symplectic and tends to bound energy error.
 * - With variable dt (or with softening), strict symplectic properties are reduced; substepping helps.
 */
export function integratePlanetMoon3BodyStep(params: NBodyStepParams2): NBodyState2 {
  const { state, dt, muStar, muPlanet, muMoon } = params;

  if (!state) throw new Error("state must be provided.");
  assertFiniteNumber(state.t, "state.t");
  assertFiniteVec3(state.rP, "state.rP");
  assertFiniteVec3(state.vP, "state.vP");
  assertFiniteVec3(state.rM, "state.rM");
  assertFiniteVec3(state.vM, "state.vM");

  assertFiniteNumber(dt, "dt");
  if (dt === 0) return state;

  assertMu(muStar, "muStar");
  assertMu(muPlanet, "muPlanet");
  assertMu(muMoon, "muMoon");

  const { eps: softening } = normalizeSoftening(params.softening);

  // a(t)
  const { aP: aP0, aM: aM0 } = accelerationsStarPlanetMoon({
    rP: state.rP,
    rM: state.rM,
    muStar,
    muPlanet,
    muMoon,
    softening,
  });

  // Drift: r1 = r0 + v0*dt + 0.5*a0*dt^2
  const dt2 = dt * dt;
  const rP1 = vAdd(vAddScaled(state.rP, state.vP, dt), vScale(aP0, 0.5 * dt2));
  const rM1 = vAdd(vAddScaled(state.rM, state.vM, dt), vScale(aM0, 0.5 * dt2));

  // a(t+dt)
  const { aP: aP1, aM: aM1 } = accelerationsStarPlanetMoon({
    rP: rP1,
    rM: rM1,
    muStar,
    muPlanet,
    muMoon,
    softening,
  });

  // Kick: v1 = v0 + 0.5*(a0 + a1)*dt
  const vP1 = vAdd(state.vP, vScale(vAdd(aP0, aP1), 0.5 * dt));
  const vM1 = vAdd(state.vM, vScale(vAdd(aM0, aM1), 0.5 * dt));

  const out: NBodyState2 = {
    t: state.t + dt,
    rP: rP1,
    vP: vP1,
    rM: rM1,
    vM: vM1,
  };

  if (!Number.isFinite(out.t) || !vIsFinite(out.rP) || !vIsFinite(out.vP) || !vIsFinite(out.rM) || !vIsFinite(out.vM)) {
    throw new Error("integratePlanetMoon3BodyStep produced non-finite state (dt too large or parameters pathological).");
  }

  return out;
}

/**
 * Deterministic multi-step integration from state.t toward target time tTarget,
 * using substeps with |dt| <= dtMaxAbs.
 *
 * This is the recommended entry point when your caller advances time in uneven increments.
 */
export function integrateToTime(params: {
  state: NBodyState2;
  tTarget: number;
  dtMaxAbs: number;
  muStar: number;
  muPlanet: number;
  muMoon: number;
  softening?: number;

  /** If true, land exactly on tTarget. Default: true. */
  exactFinalStep?: boolean;

  /** Safety cap for number of substeps. Default: 2e6. */
  maxSteps?: number;
}): NBodyState2 {
  const { state, tTarget, muStar, muPlanet, muMoon } = params;

  if (!state) throw new Error("state must be provided.");
  assertFiniteNumber(tTarget, "tTarget");
  assertFiniteNumber(params.dtMaxAbs, "dtMaxAbs");
  assertMu(muStar, "muStar");
  assertMu(muPlanet, "muPlanet");
  assertMu(muMoon, "muMoon");

  const dtMaxAbs = Math.max(0, params.dtMaxAbs);
  if (dtMaxAbs === 0) throw new Error("dtMaxAbs must be > 0.");

  const exactFinalStep = params.exactFinalStep ?? true;
  const maxSteps = Number.isFinite(params.maxSteps) ? Math.max(1, Math.floor(params.maxSteps!)) : 2_000_000;

  let s = state;
  let steps = 0;

  // Robust loop condition: avoid relying on exact float equality unless we intentionally snap.
  while (true) {
    const remaining = tTarget - s.t;
    if (remaining === 0) break;

    steps++;
    if (steps > maxSteps) throw new Error("integrateToTime exceeded maxSteps (check dtMaxAbs or target time).");

    const dir = Math.sign(remaining);
    const dtStepMag = Math.min(dtMaxAbs, Math.abs(remaining));
    const dt = dir * dtStepMag;

    if (!exactFinalStep && Math.abs(remaining) < dtMaxAbs) break;

    s = integratePlanetMoon3BodyStep({
      state: s,
      dt,
      muStar,
      muPlanet,
      muMoon,
      softening: params.softening,
    });

    // If exactFinalStep is true, the last step magnitude equals |remaining|, so we should land exactly.
    // Still, keep the termination controlled by remaining==0 to preserve determinism.
  }

  return s;
}

/**
 * Barycenter of planet+moon (for diagnostics):
 *   rB = (muP*rP + muM*rM) / (muP + muM)
 *
 * Valid because mu ∝ M when mu = G*M with a shared G.
 */
export function planetMoonBarycenter(params: { rP: Vec3; rM: Vec3; muPlanet: number; muMoon: number }): Vec3 {
  const { rP, rM, muPlanet, muMoon } = params;

  assertFiniteVec3(rP, "rP");
  assertFiniteVec3(rM, "rM");
  assertMu(muPlanet, "muPlanet");
  assertMu(muMoon, "muMoon");

  const muTot = muPlanet + muMoon;
  if (!Number.isFinite(muTot) || muTot <= 0) throw new Error("muPlanet + muMoon must be finite and > 0.");

  const wP = muPlanet / muTot;
  const wM = muMoon / muTot;
  return vAddScaled(vScale(rP, wP), rM, wM);
}

/**
 * Specific two-body orbital energy (per unit mass) relative to the star:
 *   eps = v^2/2 - muStar/r
 *
 * This is for debugging drift; do not expect perfect conservation in this restricted 3-body system,
 * and do not compare planet and moon eps directly unless you intend a specific two-body approximation.
 */
export function specificEnergyTwoBody(params: { r: Vec3; v: Vec3; muStar: number }): number {
  const { r, v, muStar } = params;

  assertFiniteVec3(r, "r");
  assertFiniteVec3(v, "v");
  assertMu(muStar, "muStar");

  const rr = vLen(r);
  const vv2 = vLenSq(v);

  if (!(rr > 0) || !Number.isFinite(rr)) return Number.NaN;
  return 0.5 * vv2 - muStar / rr;
}

/**
 * Total mechanical energy (star fixed) of the planet+moon system.
 *
 * E = (1/2)|vP|^2 + (1/2)|vM|^2
 *     - muStar/|rP| - muStar/|rM| - muPlanet*muMoon/|rM-rP| ???  (dimension caveat)
 *
 * Because we store mu = G*M (not masses), the mutual potential term cannot be written solely in mu's
 * without also knowing G (or masses separately). Therefore this helper uses the standard “mass-based”
 * expression only if the caller provides masses explicitly.
 *
 * In this codebase, prefer using specificEnergyTwoBody for sanity checks, or provide explicit masses if needed.
 */
export function totalEnergyStarFixedIfMassesProvided(params: {
  rP: Vec3;
  vP: Vec3;
  rM: Vec3;
  vM: Vec3;
  muStar: number;
  // Optional true masses (in consistent units) if you want a meaningful total energy:
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

  if (!(typeof mP === "number" && Number.isFinite(mP) && mP > 0)) return Number.NaN;
  if (!(typeof mM === "number" && Number.isFinite(mM) && mM > 0)) return Number.NaN;
  if (!(typeof G === "number" && Number.isFinite(G) && G > 0)) return Number.NaN;

  const rPmag = vLen(rP);
  const rMmag = vLen(rM);
  const rPMmag = vLen(vSub(rM, rP));
  if (!(rPmag > 0) || !(rMmag > 0) || !(rPMmag > 0)) return Number.NaN;

  const vP2 = vLenSq(vP);
  const vM2 = vLenSq(vM);

  const T = 0.5 * mP * vP2 + 0.5 * mM * vM2;
  const Ustar = -G * (mP * (muStar / G) / rPmag + mM * (muStar / G) / rMmag);
  const Upm = -G * (mP * mM) / rPMmag;

  const E = T + Ustar + Upm;
  return Number.isFinite(E) ? E : Number.NaN;
}
