import type { Vec3 } from "../../physics/vec3";
import { VEC3ZERO, vAdd, vAddScaled, vDot, vIsFinite, vLenSq, vScale, vSub } from "../../physics/vec3";
import type { NBodyState, NBodyStepParams, ResolvedNBodyConfig } from "./types";
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

function computeAccelerations(params: {
  positions: Vec3[];
  mus: number[];
  eps2: number;
  throwOnOverlap: boolean;
}): Vec3[] {
  const { positions, mus, eps2, throwOnOverlap } = params;
  const n = positions.length;
  const acc: Vec3[] = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dr = vSub(positions[j], positions[i]);
      const r2 = vLenSq(dr);

      if (!Number.isFinite(r2)) {
        throw new Error("nbody accel: non-finite pairwise squared distance.");
      }

      if (!(r2 > 0)) {
        if (throwOnOverlap && eps2 === 0) {
          throw new Error(
            "nbody accel: overlap detected with zero softening (check dt or initial conditions).",
          );
        }
        continue;
      }

      const d2 = r2 + eps2;
      if (!(d2 > 0) || !Number.isFinite(d2)) {
        if (throwOnOverlap) {
          throw new Error("nbody accel: invalid squared distance (non-finite).");
        }
        continue;
      }

      const invR = 1 / Math.sqrt(d2);
      const invR3 = invR * invR * invR;

      const muI = mus[i];
      const muJ = mus[j];

      acc[i] = vAdd(acc[i], vScale(dr, muJ * invR3));
      acc[j] = vAdd(acc[j], vScale(dr, -muI * invR3));
    }
  }

  return acc;
}

function grSchwarzschildAccelStarOnly(params: {
  rRel: Vec3;
  vRel: Vec3;
  muStar: number;
  c: number;
  eps2: number;
}): Vec3 {
  const { rRel, vRel, muStar, c, eps2 } = params;
  if (!(Number.isFinite(muStar) && muStar > 0)) return VEC3ZERO;
  if (!(Number.isFinite(c) && c > 0)) return VEC3ZERO;

  const r2 = vLenSq(rRel) + eps2;
  if (!(r2 > 0) || !Number.isFinite(r2)) return VEC3ZERO;

  const r = Math.sqrt(r2);
  if (!(r > 0) || !Number.isFinite(r)) return VEC3ZERO;

  const v2 = vLenSq(vRel);
  if (!Number.isFinite(v2)) return VEC3ZERO;

  const rv = vDot(rRel, vRel);
  if (!Number.isFinite(rv)) return VEC3ZERO;

  const c2 = c * c;
  if (!(c2 > 0) || !Number.isFinite(c2)) return VEC3ZERO;

  const scale = muStar / (c2 * r2 * r);
  const termR = (4 * muStar) / r - v2;
  const termV = 4 * rv;

  return vAdd(vScale(rRel, scale * termR), vScale(vRel, scale * termV));
}

function applyGrCorrections(params: {
  acc: Vec3[];
  positions: Vec3[];
  velocities: Vec3[];
  mus: number[];
  cfg: ResolvedNBodyConfig;
  eps2: number;
}): void {
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
}

function enforceCollisionPolicy(state: NBodyState, cfg: ResolvedNBodyConfig): void {
  if (!cfg.collision.enabled) return;
  if (!(Number.isFinite(cfg.collision.minSeparation) && cfg.collision.minSeparation > 0)) return;

  const { positions } = buildBodyArrays(state, cfg);
  const minSep = cfg.collision.minSeparation;
  const minSep2 = minSep * minSep;

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dr = vSub(positions[j], positions[i]);
      const d2 = vLenSq(dr);
      if (!Number.isFinite(d2)) continue;
      if (d2 >= minSep2) continue;
      if (cfg.collision.onCloseEncounter === "abort") {
        throw new Error(
          `nbody collisionPolicy: close encounter below minSeparation (${Math.sqrt(d2)} < ${minSep}).`,
        );
      }
      return;
    }
  }
}

function maxPositionDifference(a: NBodyState, b: NBodyState): number {
  let maxErr2 = 0;

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

  for (const [ra, rb] of pairs) {
    const d2 = vLenSq(vSub(ra, rb));
    if (Number.isFinite(d2) && d2 > maxErr2) maxErr2 = d2;
  }

  return Math.sqrt(maxErr2);
}

export function integrateStepWithConfig(params: {
  state: NBodyState;
  dt: number;
  cfg: ResolvedNBodyConfig;
}): NBodyState {
  const { state, dt, cfg } = params;
  if (dt === 0) return cloneState(state);
  enforceCollisionPolicy(state, cfg);

  const { eps2 } = normalizeSoftening(cfg.softening);
  const { positions, velocities, mus } = buildBodyArrays(state, cfg);
  const a0 = computeAccelerations({
    positions,
    mus,
    eps2,
    throwOnOverlap: cfg.throwOnOverlap,
  });
  applyGrCorrections({ acc: a0, positions, velocities, mus, cfg, eps2 });
  const dt2 = dt * dt;

  const positions1 = positions.map((r, i) =>
    vAdd(vAddScaled(r, velocities[i], dt), vScale(a0[i], 0.5 * dt2)),
  );

  const a1 = computeAccelerations({
    positions: positions1,
    mus,
    eps2,
    throwOnOverlap: cfg.throwOnOverlap,
  });
  const velocitiesForA1 = velocities.map((v, i) => vAdd(v, vScale(a0[i], dt)));
  applyGrCorrections({
    acc: a1,
    positions: positions1,
    velocities: velocitiesForA1,
    mus,
    cfg,
    eps2,
  });
  const velocities1 = velocities.map((v, i) => vAdd(v, vScale(vAdd(a0[i], a1[i]), 0.5 * dt)));

  const out = unpackBodyArrays({
    t: state.t + dt,
    positions: positions1,
    velocities: velocities1,
    perturberCount: cfg.perturbers.length,
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
    throw new Error("nbody integrator produced non-finite state (dt too large or parameters pathological).");
  }

  for (let i = 0; i < out.perturbers.length; i++) {
    if (!vIsFinite(out.perturbers[i].r) || !vIsFinite(out.perturbers[i].v)) {
      throw new Error(
        "nbody integrator produced non-finite perturber state (dt too large or parameters pathological).",
      );
    }
  }

  enforceCollisionPolicy(out, cfg);

  return out;
}

export function integrateToTimeWithConfig(params: {
  state: NBodyState;
  tTarget: number;
  cfg: ResolvedNBodyConfig;
  maxSteps?: number;
}): NBodyState {
  const { state, tTarget, cfg } = params;
  const dtMaxAbs = cfg.dtMaxAbs;
  if (!Number.isFinite(dtMaxAbs) || dtMaxAbs <= 0) {
    throw new Error("nbody dtMax must be > 0.");
  }

  const maxSteps = Number.isFinite(params.maxSteps)
    ? Math.max(1, Math.floor(params.maxSteps!))
    : cfg.integrator.maxSubsteps;

  let s = cloneState(state);
  if (cfg.integrator.mode === "fixed-verlet") {
    for (let steps = 0; steps < maxSteps; steps++) {
      const remaining = tTarget - s.t;
      if (remaining === 0) return s;

      const dir = Math.sign(remaining);
      const dtStepMag = Math.min(dtMaxAbs, Math.abs(remaining));
      const dt = dir * dtStepMag;
      s = integrateStepWithConfig({ state: s, dt, cfg });
    }
    throw new Error("nbody integrateToTime exceeded maxSteps (check dtMax).");
  }

  const tol = cfg.integrator.errorTolAbs;
  const dtMin = cfg.integrator.dtMin;
  const growth = cfg.integrator.growthFactor;
  const shrink = cfg.integrator.shrinkFactor;

  let dtAdaptive = dtMaxAbs;
  for (let steps = 0; steps < maxSteps; steps++) {
    const remaining = tTarget - s.t;
    if (remaining === 0) return s;

    const dir = Math.sign(remaining);
    const dtTryMag = Math.min(Math.abs(remaining), Math.max(dtMin, Math.abs(dtAdaptive)));
    const dtTry = dir * dtTryMag;

    const full = integrateStepWithConfig({ state: s, dt: dtTry, cfg });
    const half1 = integrateStepWithConfig({ state: s, dt: 0.5 * dtTry, cfg });
    const half2 = integrateStepWithConfig({ state: half1, dt: 0.5 * dtTry, cfg });
    const err = maxPositionDifference(full, half2);

    const canShrink = dtTryMag > dtMin * 1.0000001;
    if (Number.isFinite(err) && err > tol && canShrink) {
      dtAdaptive = Math.max(dtMin, dtTryMag * shrink);
      continue;
    }

    s = half2;
    if (Number.isFinite(err) && err < 0.25 * tol) {
      dtAdaptive = Math.min(dtMaxAbs, dtTryMag * growth);
    } else {
      dtAdaptive = dtTryMag;
    }
  }

  throw new Error("nbody adaptive integrateToTime exceeded maxSteps (check integrator settings).");
}

// Compatibility exports for existing tests/utils.
export function integrateNBodyStep(params: NBodyStepParams): NBodyState {
  const muPerturbers = Array.isArray(params.muPerturbers)
    ? params.muPerturbers
    : params.state.perturbers.map(() => 0);

  const cfg: ResolvedNBodyConfig = {
    muStar: params.muStar,
    muPlanet: params.muPlanet,
    muMoon: params.muMoon,
    dtMaxAbs: Math.max(1e-12, Math.abs(params.dt || 1)),
    softening: Number.isFinite(params.softening) ? Math.max(0, params.softening as number) : 0,
    throwOnOverlap: Boolean(params.throwOnOverlap),
    perturbers: muPerturbers.map((mu) => ({
      mu,
      orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
    })),
    relativity: { grOn: false, c: 299792458 },
    integrator: {
      mode: "fixed-verlet",
      errorTolAbs: 1e-3,
      dtMin: 1e-6,
      growthFactor: 1.5,
      shrinkFactor: 0.5,
      maxSubsteps: 1_000_000,
    },
    collision: {
      enabled: false,
      minSeparation: 0,
      onCloseEncounter: "warn",
    },
  };

  // Replace dummy orbits with only mu values used by integrator.
  cfg.perturbers = muPerturbers.map((mu) => ({
    mu,
    orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
  }));

  return integrateStepWithConfig({ state: params.state, dt: params.dt, cfg });
}

export function integratePlanetMoon3BodyStep(params: NBodyStepParams): NBodyState {
  if (Array.isArray(params.muPerturbers) && params.muPerturbers.length > 0) {
    throw new Error("integratePlanetMoon3BodyStep does not accept perturbers; use integrateNBodyStep.");
  }
  if (params.state.perturbers.length > 0) {
    throw new Error("integratePlanetMoon3BodyStep does not accept perturber states; use integrateNBodyStep.");
  }

  return integrateNBodyStep({ ...params, muPerturbers: [] });
}

export function integrateToTime(params: {
  state: NBodyState;
  tTarget: number;
  dtMaxAbs: number;
  muStar: number;
  muPlanet: number;
  muMoon: number;
  muPerturbers?: number[];
  softening?: number;
  exactFinalStep?: boolean;
  maxSteps?: number;
  throwOnOverlap?: boolean;
}): NBodyState {
  const dtMaxAbs = Math.max(0, params.dtMaxAbs);
  if (dtMaxAbs === 0) throw new Error("dtMaxAbs must be > 0.");

  const cfg: ResolvedNBodyConfig = {
    muStar: params.muStar,
    muPlanet: params.muPlanet,
    muMoon: params.muMoon,
    dtMaxAbs,
    softening: Number.isFinite(params.softening) ? Math.max(0, params.softening as number) : 0,
    throwOnOverlap: Boolean(params.throwOnOverlap),
    perturbers: (params.muPerturbers ?? []).map((mu) => ({
      mu,
      orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
    })),
    relativity: { grOn: false, c: 299792458 },
    integrator: {
      mode: "fixed-verlet",
      errorTolAbs: 1e-3,
      dtMin: 1e-6,
      growthFactor: 1.5,
      shrinkFactor: 0.5,
      maxSubsteps: Number.isFinite(params.maxSteps) ? Math.max(1, Math.floor(params.maxSteps!)) : 2_000_000,
    },
    collision: {
      enabled: false,
      minSeparation: 0,
      onCloseEncounter: "warn",
    },
  };

  const exactFinalStep = params.exactFinalStep ?? true;
  let s = cloneState(params.state);
  const maxSteps = cfg.integrator.maxSubsteps;
  for (let steps = 0; steps < maxSteps; steps++) {
    const remaining = params.tTarget - s.t;
    if (remaining === 0) return s;

    if (!exactFinalStep && Math.abs(remaining) < dtMaxAbs) return s;

    const dir = Math.sign(remaining);
    const dtStepMag = Math.min(dtMaxAbs, Math.abs(remaining));
    const dt = dir * dtStepMag;

    s = integrateStepWithConfig({ state: s, dt, cfg });
  }

  throw new Error("integrateToTime exceeded maxSteps (check dtMaxAbs or target time).");
}
