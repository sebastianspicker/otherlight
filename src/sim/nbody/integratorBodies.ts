/**
 * Converts between named N-body state vectors and the ordered arrays used by numerical integration.
 */
import type { Vec3 } from "../../physics/vec3";
import type { NBodyState, ResolvedNBodyConfig } from "./types";

export type BodyArrays = {
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
