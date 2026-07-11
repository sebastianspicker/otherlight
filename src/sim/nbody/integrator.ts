import type { Vec3 } from "../../physics/vec3";
import { VEC3ZERO, vAdd, vDot, vIsFinite, vLenSq, vScale, vSub } from "../../physics/vec3";
import type { NBodyState, ResolvedNBodyConfig } from "./types";
import { cloneState } from "./cache";

function normalizeSoftening(softening: number): { eps: number; eps2: number } {
  const eps = Number.isFinite(softening) ? Math.max(0, softening) : 0;
  return { eps, eps2: eps * eps };
}

type BodyArrays = {
  positions: Vec3[];
  velocities: Vec3[];
  mus: number[];
};

type PairDisplacement = {
  drX: number;
  drY: number;
  drZ: number;
  r2: number;
};

type SchwarzschildInputs = {
  r: number;
  r2: number;
  v2: number;
  rv: number;
  c2: number;
};

type AdaptiveSettings = {
  tol: number;
  dtMin: number;
  growth: number;
  shrink: number;
  dtMaxAbs: number;
};

type AdaptiveEstimate = {
  state: NBodyState;
  err: number;
};

export function buildBodyArrays(state: NBodyState, cfg: ResolvedNBodyConfig): BodyArrays {
  const pert = state.perturbers ?? [];
  if (pert.length !== cfg.perturbers.length) {
    throw new Error(
      `nbody perturber mismatch: state has ${pert.length}, config has ${cfg.perturbers.length}.`,
    );
  }

  const positions: Vec3[] = [state.rS, state.rP, state.rM];
  const velocities: Vec3[] = [state.vS, state.vP, state.vM];
  const mus: number[] = [cfg.muStar, cfg.muPlanet, cfg.muMoon];

  for (let i = 0; i < pert.length; i++) {
    positions.push(pert[i].r);
    velocities.push(pert[i].v);
    mus.push(cfg.perturbers[i].mu);
  }

  return { positions, velocities, mus };
}

export function unpackBodyArrays(params: {
  t: number;
  positions: Vec3[];
  velocities: Vec3[];
  perturberCount: number;
}): NBodyState {
  const { t, positions, velocities, perturberCount } = params;
  const expected = 3 + perturberCount;
  if (positions.length !== expected || velocities.length !== expected) {
    throw new Error("nbody unpack: body count mismatch.");
  }

  const pert: { r: Vec3; v: Vec3 }[] = [];
  for (let i = 3; i < expected; i++) {
    pert.push({ r: positions[i], v: velocities[i] });
  }

  return {
    t,
    rS: positions[0],
    vS: velocities[0],
    rP: positions[1],
    vP: velocities[1],
    rM: positions[2],
    vM: velocities[2],
    perturbers: pert,
  };
}

const zeroAccelerationArray = (count: number): Vec3[] => {
  const acc: Vec3[] = new Array(count);
  for (let i = 0; i < count; i++) {
    acc[i] = { x: 0, y: 0, z: 0 };
  }
  return acc;
};

const pairDisplacement = (posI: Vec3, posJ: Vec3): PairDisplacement => {
  const drX = posJ.x - posI.x;
  const drY = posJ.y - posI.y;
  const drZ = posJ.z - posI.z;
  return {
    drX,
    drY,
    drZ,
    r2: drX * drX + drY * drY + drZ * drZ,
  };
};

const validatedSoftenedDistance = (
  pair: PairDisplacement,
  eps2: number,
  throwOnOverlap: boolean,
): number | undefined => {
  if (!Number.isFinite(pair.r2)) {
    throw new Error("nbody accel: non-finite pairwise squared distance.");
  }

  if (!(pair.r2 > 0)) {
    if (throwOnOverlap && eps2 === 0) {
      throw new Error("nbody accel: overlap detected with zero softening (check dt or initial conditions).");
    }
    return undefined;
  }

  const d2 = pair.r2 + eps2;
  if (!(d2 > 0) || !Number.isFinite(d2)) {
    if (throwOnOverlap) {
      throw new Error("nbody accel: invalid squared distance (non-finite).");
    }
    return undefined;
  }

  return d2;
};

const accumulatePairAcceleration = (params: {
  accI: Vec3;
  accJ: Vec3;
  pair: PairDisplacement;
  invR3: number;
  muI: number;
  muJ: number;
}): void => {
  const { accI, accJ, pair, invR3, muI, muJ } = params;
  const scaleI = muJ * invR3;
  const scaleJ = -muI * invR3;

  accI.x += pair.drX * scaleI;
  accI.y += pair.drY * scaleI;
  accI.z += pair.drZ * scaleI;

  accJ.x += pair.drX * scaleJ;
  accJ.y += pair.drY * scaleJ;
  accJ.z += pair.drZ * scaleJ;
};

const computeAccelerations = (params: {
  positions: Vec3[];
  mus: number[];
  eps2: number;
  throwOnOverlap: boolean;
}): Vec3[] => {
  const { positions, mus, eps2, throwOnOverlap } = params;
  const n = positions.length;
  const acc = zeroAccelerationArray(n);

  for (let i = 0; i < n; i++) {
    const accI = acc[i];
    const posI = positions[i];
    const muI = mus[i];
    for (let j = i + 1; j < n; j++) {
      const pair = pairDisplacement(posI, positions[j]);
      const d2 = validatedSoftenedDistance(pair, eps2, throwOnOverlap);
      if (d2 === undefined) continue;

      const invR = 1 / Math.sqrt(d2);
      accumulatePairAcceleration({
        accI,
        accJ: acc[j],
        pair,
        invR3: invR * invR * invR,
        muI,
        muJ: mus[j],
      });
    }
  }

  return acc;
};

const isPositiveFinite = (value: number): boolean => {
  return Number.isFinite(value) && value > 0;
};

const schwarzschildInputs = (params: {
  rRel: Vec3;
  vRel: Vec3;
  muStar: number;
  c: number;
  eps2: number;
}): SchwarzschildInputs | undefined => {
  const { rRel, vRel, muStar, c, eps2 } = params;
  if (!isPositiveFinite(muStar)) return undefined;
  if (!isPositiveFinite(c)) return undefined;

  const r2 = vLenSq(rRel) + eps2;
  if (!isPositiveFinite(r2)) return undefined;

  const r = Math.sqrt(r2);
  if (!isPositiveFinite(r)) return undefined;

  const v2 = vLenSq(vRel);
  if (!Number.isFinite(v2)) return undefined;

  const rv = vDot(rRel, vRel);
  if (!Number.isFinite(rv)) return undefined;

  const c2 = c * c;
  if (!isPositiveFinite(c2)) return undefined;

  return { r, r2, v2, rv, c2 };
};

const grSchwarzschildAccelStarOnly = (params: {
  rRel: Vec3;
  vRel: Vec3;
  muStar: number;
  c: number;
  eps2: number;
}): Vec3 => {
  const { rRel, vRel, muStar, c, eps2 } = params;
  const inputs = schwarzschildInputs({ rRel, vRel, muStar, c, eps2 });
  if (inputs === undefined) return VEC3ZERO;

  const scale = muStar / (inputs.c2 * inputs.r2 * inputs.r);
  const termR = (4 * muStar) / inputs.r - inputs.v2;
  const termV = 4 * inputs.rv;

  return vAdd(vScale(rRel, scale * termR), vScale(vRel, scale * termV));
};

const applyGrCorrections = (params: {
  acc: Vec3[];
  positions: Vec3[];
  velocities: Vec3[];
  mus: number[];
  cfg: ResolvedNBodyConfig;
  eps2: number;
}): void => {
  const { acc, positions, velocities, mus, cfg, eps2 } = params;
  if (!cfg.relativity.grOn) return;

  const muStar = cfg.muStar;
  const c = cfg.relativity.c;
  const rS = positions[0];
  const vS = velocities[0];

  for (let i = 1; i < positions.length; i++) {
    const rRel = vSub(positions[i], rS);
    const vRel = vSub(velocities[i], vS);
    const gr = grSchwarzschildAccelStarOnly({ rRel, vRel, muStar, c, eps2 });
    if (!vIsFinite(gr)) continue;

    const muBody = mus[i];
    const muTot = muStar + muBody;
    if (!(Number.isFinite(muTot) && muTot > 0)) continue;

    const wBody = muStar / muTot;
    const wStar = muBody / muTot;

    acc[i] = vAdd(acc[i], vScale(gr, wBody));
    acc[0] = vAdd(acc[0], vScale(gr, -wStar));
  }
};

const activeCollisionMinSeparation = (cfg: ResolvedNBodyConfig): number | undefined => {
  if (!cfg.collision.enabled) return undefined;
  if (!isPositiveFinite(cfg.collision.minSeparation)) return undefined;
  return cfg.collision.minSeparation;
};

const findCloseEncounterDistance = (positions: Vec3[], minSep2: number): number | undefined => {
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dr = vSub(positions[j], positions[i]);
      const d2 = vLenSq(dr);
      if (!Number.isFinite(d2)) continue;
      if (d2 >= minSep2) continue;
      return Math.sqrt(d2);
    }
  }
  return undefined;
};

const enforceCollisionPolicy = (state: NBodyState, cfg: ResolvedNBodyConfig): void => {
  const minSep = activeCollisionMinSeparation(cfg);
  if (minSep === undefined) return;

  const { positions } = buildBodyArrays(state, cfg);
  const closeDistance = findCloseEncounterDistance(positions, minSep * minSep);
  if (closeDistance === undefined) return;
  if (cfg.collision.onCloseEncounter !== "abort") return;

  throw new Error(
    `nbody collisionPolicy: close encounter below minSeparation (${closeDistance} < ${minSep}).`,
  );
};

const positionDifferencePairs = (a: NBodyState, b: NBodyState): Array<[Vec3, Vec3]> => {
  const pairs: Array<[Vec3, Vec3]> = [
    [a.rS, b.rS],
    [a.rP, b.rP],
    [a.rM, b.rM],
  ];

  const ap = a.perturbers ?? [];
  const bp = b.perturbers ?? [];
  const n = Math.min(ap.length, bp.length);
  for (let i = 0; i < n; i++) {
    pairs.push([ap[i].r, bp[i].r]);
  }

  return pairs;
};

function maxFiniteDistanceSquared(pairs: Array<[Vec3, Vec3]>): number {
  let maxErr2 = 0;
  for (const [ra, rb] of pairs) {
    const d2 = vLenSq(vSub(ra, rb));
    if (Number.isFinite(d2) && d2 > maxErr2) maxErr2 = d2;
  }
  return maxErr2;
}

function maxPositionDifference(a: NBodyState, b: NBodyState): number {
  return Math.sqrt(maxFiniteDistanceSquared(positionDifferencePairs(a, b)));
}

function accelerationsForArrays(params: {
  positions: Vec3[];
  velocities: Vec3[];
  mus: number[];
  cfg: ResolvedNBodyConfig;
  eps2: number;
}): Vec3[] {
  const { positions, velocities, mus, cfg, eps2 } = params;
  const acc = computeAccelerations({
    positions,
    mus,
    eps2,
    throwOnOverlap: cfg.throwOnOverlap,
  });
  applyGrCorrections({ acc, positions, velocities, mus, cfg, eps2 });
  return acc;
}

function advancePositions(positions: Vec3[], velocities: Vec3[], accelerations: Vec3[], dt: number): Vec3[] {
  const positionScale = 0.5 * dt * dt;
  const next: Vec3[] = new Array(positions.length);
  for (let i = 0; i < positions.length; i++) {
    const r = positions[i];
    const v = velocities[i];
    const a = accelerations[i];
    next[i] = {
      x: r.x + v.x * dt + a.x * positionScale,
      y: r.y + v.y * dt + a.y * positionScale,
      z: r.z + v.z * dt + a.z * positionScale,
    };
  }
  return next;
}

function estimateEndVelocities(velocities: Vec3[], accelerations: Vec3[], dt: number): Vec3[] {
  // NOTE: Known O(dt) approximation — the GR correction is velocity-dependent,
  // but we use an Euler-extrapolated velocity (v + a0*dt) rather than the
  // true velocity at time t+dt.  This introduces a first-order error in the
  // GR velocity-dependent terms.  The correction itself is small (post-
  // Newtonian), so the lower-order velocity error is acceptable for an
  // interactive simulation and does not accumulate secularly.
  const next: Vec3[] = new Array(velocities.length);
  for (let i = 0; i < velocities.length; i++) {
    const v = velocities[i];
    const a = accelerations[i];
    next[i] = {
      x: v.x + a.x * dt,
      y: v.y + a.y * dt,
      z: v.z + a.z * dt,
    };
  }
  return next;
}

function advanceVelocities(velocities: Vec3[], a0: Vec3[], a1: Vec3[], dt: number): Vec3[] {
  const velocityScale = 0.5 * dt;
  const next: Vec3[] = new Array(velocities.length);
  for (let i = 0; i < velocities.length; i++) {
    const v = velocities[i];
    const aStart = a0[i];
    const aEnd = a1[i];
    next[i] = {
      x: v.x + (aStart.x + aEnd.x) * velocityScale,
      y: v.y + (aStart.y + aEnd.y) * velocityScale,
      z: v.z + (aStart.z + aEnd.z) * velocityScale,
    };
  }
  return next;
}

function primaryStateVectors(state: NBodyState): Vec3[] {
  return [state.rS, state.vS, state.rP, state.vP, state.rM, state.vM];
}

function assertFiniteIntegratedState(state: NBodyState): void {
  if (!Number.isFinite(state.t)) {
    throw new Error("nbody integrator produced non-finite state (dt too large or parameters pathological).");
  }

  for (const value of primaryStateVectors(state)) {
    if (!vIsFinite(value)) {
      throw new Error(
        "nbody integrator produced non-finite state (dt too large or parameters pathological).",
      );
    }
  }

  for (let i = 0; i < state.perturbers.length; i++) {
    if (!vIsFinite(state.perturbers[i].r) || !vIsFinite(state.perturbers[i].v)) {
      throw new Error(
        "nbody integrator produced non-finite perturber state (dt too large or parameters pathological).",
      );
    }
  }
}

function integrateStepWithConfig(params: {
  state: NBodyState;
  dt: number;
  cfg: ResolvedNBodyConfig;
}): NBodyState {
  const { state, dt, cfg } = params;
  if (dt === 0) return cloneState(state);
  enforceCollisionPolicy(state, cfg);

  const { eps2 } = normalizeSoftening(cfg.softening);
  const { positions, velocities, mus } = buildBodyArrays(state, cfg);
  const a0 = accelerationsForArrays({ positions, velocities, mus, cfg, eps2 });
  const positions1 = advancePositions(positions, velocities, a0, dt);
  const velocitiesForA1 = estimateEndVelocities(velocities, a0, dt);
  const a1 = accelerationsForArrays({
    positions: positions1,
    velocities: velocitiesForA1,
    mus,
    cfg,
    eps2,
  });
  const velocities1 = advanceVelocities(velocities, a0, a1, dt);

  const out = unpackBodyArrays({
    t: state.t + dt,
    positions: positions1,
    velocities: velocities1,
    perturberCount: cfg.perturbers.length,
  });

  assertFiniteIntegratedState(out);
  enforceCollisionPolicy(out, cfg);

  return out;
}

function ensureDtMaxAbs(dtMaxAbs: number): void {
  if (!Number.isFinite(dtMaxAbs) || dtMaxAbs <= 0) {
    throw new Error("nbody dtMax must be > 0.");
  }
}

function resolveMaxSteps(maxSteps: number | undefined, cfg: ResolvedNBodyConfig): number {
  if (maxSteps !== undefined && Number.isFinite(maxSteps)) {
    return Math.max(1, Math.floor(maxSteps));
  }
  return cfg.integrator.maxSubsteps;
}

function isAtIntegrationTarget(remaining: number): boolean {
  return Math.abs(remaining) < 1e-12;
}

function directedStep(remaining: number, stepMagnitude: number): number {
  return Math.sign(remaining) * Math.min(stepMagnitude, Math.abs(remaining));
}

function integrateFixedVerletToTime(params: {
  state: NBodyState;
  tTarget: number;
  cfg: ResolvedNBodyConfig;
  dtMaxAbs: number;
  maxSteps: number;
}): NBodyState {
  const { tTarget, cfg, dtMaxAbs, maxSteps } = params;
  let s = params.state;

  for (let steps = 0; steps < maxSteps; steps++) {
    const remaining = tTarget - s.t;
    if (isAtIntegrationTarget(remaining)) return s;

    s = integrateStepWithConfig({
      state: s,
      dt: directedStep(remaining, dtMaxAbs),
      cfg,
    });
  }

  throw new Error("nbody integrateToTime exceeded maxSteps (check dtMax).");
}

function adaptiveSettings(cfg: ResolvedNBodyConfig, dtMaxAbs: number): AdaptiveSettings {
  return {
    tol: cfg.integrator.errorTolAbs,
    dtMin: cfg.integrator.dtMin,
    growth: cfg.integrator.growthFactor,
    shrink: cfg.integrator.shrinkFactor,
    dtMaxAbs,
  };
}

function adaptiveStepMagnitude(remaining: number, dtAdaptive: number, settings: AdaptiveSettings): number {
  return Math.min(Math.abs(remaining), Math.max(settings.dtMin, Math.abs(dtAdaptive)));
}

function adaptiveErrorEstimate(state: NBodyState, dtTry: number, cfg: ResolvedNBodyConfig): AdaptiveEstimate {
  const full = integrateStepWithConfig({ state, dt: dtTry, cfg });
  const half1 = integrateStepWithConfig({ state, dt: 0.5 * dtTry, cfg });
  const half2 = integrateStepWithConfig({ state: half1, dt: 0.5 * dtTry, cfg });
  return { state: half2, err: maxPositionDifference(full, half2) };
}

function canShrinkAdaptiveStep(dtTryMag: number, settings: AdaptiveSettings): boolean {
  return dtTryMag > settings.dtMin * 1.0000001;
}

function shouldShrinkAdaptiveStep(err: number, settings: AdaptiveSettings, canShrink: boolean): boolean {
  return Number.isFinite(err) && err > settings.tol && canShrink;
}

function warnIfAcceptedAtDtMin(err: number, settings: AdaptiveSettings, canShrink: boolean): void {
  // Accepted at dtMin with error above tolerance — the integrator cannot
  // refine further.  Log a warning so the caller can diagnose stiff or
  // pathological configurations.
  if (!canShrink && Number.isFinite(err) && err > settings.tol) {
    console.warn(
      `nbody adaptive integrator: accepted step at dtMin (${settings.dtMin}) with error ` +
        `${err.toExponential(3)} > tol ${settings.tol.toExponential(3)}. ` +
        `Consider reducing dtMin or relaxing tolerance.`,
    );
  }
}

function nextAcceptedAdaptiveStep(err: number, dtTryMag: number, settings: AdaptiveSettings): number {
  if (Number.isFinite(err) && err < 0.25 * settings.tol) {
    return Math.min(settings.dtMaxAbs, dtTryMag * settings.growth);
  }
  return dtTryMag;
}

function integrateAdaptiveToTime(params: {
  state: NBodyState;
  tTarget: number;
  cfg: ResolvedNBodyConfig;
  settings: AdaptiveSettings;
  maxSteps: number;
}): NBodyState {
  const { tTarget, cfg, settings, maxSteps } = params;
  let s = params.state;
  let dtAdaptive = settings.dtMaxAbs;

  for (let steps = 0; steps < maxSteps; steps++) {
    const remaining = tTarget - s.t;
    if (isAtIntegrationTarget(remaining)) return s;

    const dtTryMag = adaptiveStepMagnitude(remaining, dtAdaptive, settings);
    const estimate = adaptiveErrorEstimate(s, Math.sign(remaining) * dtTryMag, cfg);
    const canShrink = canShrinkAdaptiveStep(dtTryMag, settings);

    if (shouldShrinkAdaptiveStep(estimate.err, settings, canShrink)) {
      dtAdaptive = Math.max(settings.dtMin, dtTryMag * settings.shrink);
      continue;
    }

    warnIfAcceptedAtDtMin(estimate.err, settings, canShrink);
    s = estimate.state;
    dtAdaptive = nextAcceptedAdaptiveStep(estimate.err, dtTryMag, settings);
  }

  throw new Error("nbody adaptive integrateToTime exceeded maxSteps (check integrator settings).");
}

export function integrateToTimeWithConfig(params: {
  state: NBodyState;
  tTarget: number;
  cfg: ResolvedNBodyConfig;
  maxSteps?: number;
}): NBodyState {
  const { state, tTarget, cfg } = params;
  const dtMaxAbs = cfg.dtMaxAbs;
  ensureDtMaxAbs(dtMaxAbs);

  const maxSteps = resolveMaxSteps(params.maxSteps, cfg);
  const initialState = cloneState(state);
  if (cfg.integrator.mode === "fixed-verlet") {
    return integrateFixedVerletToTime({ state: initialState, tTarget, cfg, dtMaxAbs, maxSteps });
  }

  return integrateAdaptiveToTime({
    state: initialState,
    tTarget,
    cfg,
    settings: adaptiveSettings(cfg, dtMaxAbs),
    maxSteps,
  });
}
