/**
 * Performs one velocity-Verlet N-body step and validates its resulting state.
 */
import type { Vec3 } from "../../physics/vec3";
import { vIsFinite, vLenSq, vSub } from "../../physics/vec3";
import { cloneState } from "./cache";
import { buildBodyArrays, unpackBodyArrays } from "./integratorBodies";
import { auditVerletStepCollision } from "./integratorCollision";
import { accelerationsForArrays, enforceCollisionPolicy, normalizeSoftening } from "./integratorForces";
import type { NBodyState, ResolvedNBodyConfig } from "./types";

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
  // NOTE: Known O(dt) approximation. The GR correction is velocity-dependent,
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
  const a0 = accelerationsForArrays({ positions, velocities, mus, cfg, eps2 });
  const positions1 = advancePositions(positions, velocities, a0, dt);
  const sweptEncounterDistance = auditVerletStepCollision({
    positions,
    velocities,
    accelerations: a0,
    dt,
    cfg,
  });
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
  out.minimumEncounterDistance = minimumFiniteDistance(
    state.minimumEncounterDistance,
    sweptEncounterDistance,
  );

  assertFiniteIntegratedState(out);
  enforceCollisionPolicy(out, cfg);

  return out;
}

function minimumFiniteDistance(left: number | undefined, right: number | undefined): number | undefined {
  const values = [left, right].filter((value): value is number => Number.isFinite(value));
  return values.length > 0 ? Math.min(...values) : undefined;
}

export function maxPositionDifference(a: NBodyState, b: NBodyState): number {
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

  let maxErr2 = 0;
  for (const [ra, rb] of pairs) {
    const d2 = vLenSq(vSub(ra, rb));
    if (Number.isFinite(d2) && d2 > maxErr2) maxErr2 = d2;
  }
  return Math.sqrt(maxErr2);
}
