/** Covers baseline energy vectors data and helpers used by physics baseline regression checks. */

import type { Vec3 } from "../../src/physics/vec3";
import { vLenSq, vSub } from "../../src/physics/vec3";
import type { NBodyState } from "../../src/sim/nbody/types";

function baselineGravityConstant(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
}

function bodyStateVectors(state: NBodyState): {
  positions: Vec3[];
  velocities: Vec3[];
} {
  return {
    positions: [state.rS, state.rP, state.rM, ...(state.perturbers ?? []).map((p) => p.r)],
    velocities: [state.vS, state.vP, state.vM, ...(state.perturbers ?? []).map((p) => p.v)],
  };
}

function assertBodyCount(positions: unknown[], velocities: unknown[], mus: number[]): void {
  if (positions.length !== mus.length || velocities.length !== mus.length) {
    throw new Error("baseline energy helper: body count mismatch");
  }
}

function kineticEnergyFromMu(velocities: Vec3[], mus: number[], G: number): number {
  let energy = 0;
  for (let i = 0; i < mus.length; i++) {
    energy += 0.5 * (mus[i] / G) * vLenSq(velocities[i]);
  }
  return energy;
}

function potentialEnergyFromMu(positions: Vec3[], mus: number[], G: number): number {
  let energy = 0;
  for (let i = 0; i < mus.length; i++) {
    for (let j = i + 1; j < mus.length; j++) {
      const r = Math.sqrt(vLenSq(vSub(positions[j], positions[i])));
      energy += -(mus[i] * mus[j]) / (G * r);
    }
  }
  return energy;
}

export function totalEnergyFromMu(params: { state: NBodyState; mus: number[]; G?: number }): number {
  const G = baselineGravityConstant(params.G);
  const { positions, velocities } = bodyStateVectors(params.state);
  assertBodyCount(positions, velocities, params.mus);
  return kineticEnergyFromMu(velocities, params.mus, G) + potentialEnergyFromMu(positions, params.mus, G);
}
