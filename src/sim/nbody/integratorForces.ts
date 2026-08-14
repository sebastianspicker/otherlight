/**
 * Calculates Newtonian, relativistic, and collision-policy contributions for N-body integration.
 */
import type { Vec3 } from "../../physics/vec3";
import { VEC3ZERO, vAdd, vDot, vIsFinite, vLenSq, vScale, vSub } from "../../physics/vec3";
import { buildBodyArrays } from "./integratorBodies";
import type { NBodyState, ResolvedNBodyConfig } from "./types";

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

export function normalizeSoftening(softening: number): { eps: number; eps2: number } {
  const eps = Number.isFinite(softening) ? Math.max(0, softening) : 0;
  return { eps, eps2: eps * eps };
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

export function accelerationsForArrays(params: {
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

export function enforceCollisionPolicy(state: NBodyState, cfg: ResolvedNBodyConfig): void {
  const minSep = activeCollisionMinSeparation(cfg);
  if (minSep === undefined) return;

  const { positions } = buildBodyArrays(state, cfg);
  const closeDistance = findCloseEncounterDistance(positions, minSep * minSep);
  if (closeDistance === undefined) return;
  if (cfg.collision.onCloseEncounter !== "abort") return;

  throw new Error(
    `nbody collisionPolicy: close encounter below minSeparation (${closeDistance} < ${minSep}).`,
  );
}
