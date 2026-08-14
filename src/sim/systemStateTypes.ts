/** Defines shared dynamic-state contracts and sanitization helpers for system-state resolvers. */
import type { SkyPoint, SystemParams } from "../core/types";
import type { Vec3 } from "../physics/vec3";
import { VEC3ZERO, vAdd, vIsFinite, vScale } from "../physics/vec3";

export type DynamicBodyState = {
  r: Vec3;
  v: Vec3;
  sky: SkyPoint;
};

export type DynamicSystemState = {
  tObs: number;
  observerDir: Vec3;
  planet: DynamicBodyState;
  moon?: DynamicBodyState;
  star: DynamicBodyState;
};

export function sanitizeDynamicVelocities(
  planet: DynamicBodyState,
  moon: DynamicBodyState | undefined,
  star: DynamicBodyState,
): void {
  if (!vIsFinite(planet.v)) planet.v = VEC3ZERO;
  if (moon && !vIsFinite(moon.v)) moon.v = VEC3ZERO;
  if (!vIsFinite(star.v)) star.v = VEC3ZERO;
}

export function estimateStarReflexFromMassClosure(
  params: SystemParams,
  planet: DynamicBodyState,
  moon?: DynamicBodyState,
): Pick<DynamicBodyState, "r" | "v"> {
  const mS = params.star?.m;
  const mP = params.planet?.m;
  const mM = params.moon?.m;

  if (!(Number.isFinite(mS) && (mS as number) > 0)) {
    return { r: VEC3ZERO, v: VEC3ZERO };
  }

  const invMS = 1 / (mS as number);
  let r = VEC3ZERO;
  let v = VEC3ZERO;

  if (Number.isFinite(mP) && (mP as number) > 0) {
    r = vAdd(r, vScale(planet.r, -(mP as number) * invMS));
    v = vAdd(v, vScale(planet.v, -(mP as number) * invMS));
  }

  if (moon && Number.isFinite(mM) && (mM as number) > 0) {
    r = vAdd(r, vScale(moon.r, -(mM as number) * invMS));
    v = vAdd(v, vScale(moon.v, -(mM as number) * invMS));
  }

  return { r, v };
}
