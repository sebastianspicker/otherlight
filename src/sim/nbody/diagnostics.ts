import { G_SI } from "../../core/units";
import { vCross, vLen, vLenSq, vSub } from "../../physics/vec3";
import { buildBodyArrays } from "./integrator";
import type { NBodyConservationDiagnostics, NBodyState, ResolvedNBodyConfig } from "./types";

export function computeConservationDiagnostics(
  state: NBodyState,
  cfg: ResolvedNBodyConfig,
): NBodyConservationDiagnostics | null {
  const { positions, velocities, mus } = buildBodyArrays(state, cfg);
  if (positions.length !== velocities.length || positions.length !== mus.length) return null;

  let kinetic = 0;
  let potential = 0;
  let lx = 0;
  let ly = 0;
  let lz = 0;

  for (let i = 0; i < positions.length; i++) {
    const m = mus[i] / G_SI;
    if (!(Number.isFinite(m) && m > 0)) return null;
    const v2 = vLenSq(velocities[i]);
    if (!Number.isFinite(v2)) return null;
    kinetic += 0.5 * m * v2;

    const lVec = vCross(positions[i], velocities[i]);
    lx += m * lVec.x;
    ly += m * lVec.y;
    lz += m * lVec.z;
  }

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const rij = vLen(vSub(positions[j], positions[i]));
      if (!(Number.isFinite(rij) && rij > 0)) return null;
      potential += -(mus[i] * mus[j]) / (G_SI * rij);
    }
  }

  const energy = kinetic + potential;
  const angularMomentum = Math.hypot(lx, ly, lz);
  if (!Number.isFinite(energy) || !Number.isFinite(angularMomentum)) return null;
  return { energy, angularMomentum };
}
