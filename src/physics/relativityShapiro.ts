/**
 * Owns relativity Shapiro support within the physics layer. Keeps numerical and frame conventions centralized for all consumers.
 */
import type { Vec3 } from "./vec3";
import { vDot, vIsFinite, vLen, vNormalizeOrZero } from "./vec3";

export type ShapiroDelayEvaluation = {
  delaySec: number;
  impactFloorEngaged: boolean;
};

export type ShapiroMass = { mu: number; r: Vec3 };

const DEFAULT_SHAPIRO_MIN_IMPACT = 0;

export function evaluateShapiroDelay(params: {
  r: Vec3;
  observerDir: Vec3;
  mu: number;
  c: number;
  minImpact?: number;
}): ShapiroDelayEvaluation {
  const { r, observerDir, mu, c } = params;
  if (!vIsFinite(r) || !vIsFinite(observerDir)) return zeroShapiroEvaluation();
  if (!isPositiveFinite(mu) || !isPositiveFinite(c)) return zeroShapiroEvaluation();

  const dir = normalizedDirection(observerDir);
  if (!dir) return zeroShapiroEvaluation();

  const rMag = positiveVectorLength(r);
  if (rMag === undefined) return zeroShapiroEvaluation();

  return evaluateShapiroGeometry({ r, dir, mu, c, rMag, minImpact: params.minImpact });
}

export function evaluateShapiroDelayMultiBody(params: {
  rBody: Vec3;
  observerDir: Vec3;
  masses: ShapiroMass[];
  c: number;
  minImpact?: number;
}): ShapiroDelayEvaluation {
  if (!hasShapiroMasses(params.masses)) return zeroShapiroEvaluation();
  let sum = 0;
  let impactFloorEngaged = false;
  for (const mass of params.masses) {
    const evaluated = evaluateShapiroMassContribution(params, mass);
    impactFloorEngaged ||= evaluated.impactFloorEngaged;
    sum += finiteOrZero(evaluated.delaySec);
  }
  return {
    delaySec: finiteOrZero(sum),
    impactFloorEngaged,
  };
}

function zeroShapiroEvaluation(): ShapiroDelayEvaluation {
  return { delaySec: 0, impactFloorEngaged: false };
}

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizedDirection(observerDir: Vec3): Vec3 | undefined {
  const dir = vNormalizeOrZero(observerDir, 1e-15);
  return vLen(dir) > 0 ? dir : undefined;
}

function positiveVectorLength(vec: Vec3): number | undefined {
  const length = vLen(vec);
  return Number.isFinite(length) && length > 0 ? length : undefined;
}

function evaluateShapiroGeometry(params: {
  r: Vec3;
  dir: Vec3;
  mu: number;
  c: number;
  rMag: number;
  minImpact?: number;
}): ShapiroDelayEvaluation {
  const z = vDot(params.r, params.dir);
  const minImpact = nonNegativeFiniteOrDefault(params.minImpact, DEFAULT_SHAPIRO_MIN_IMPACT);
  const impact = Math.sqrt(Math.max(0, params.rMag * params.rMag - z * z));
  const impactFloorEngaged = impact < minImpact;
  const effectiveImpact = Math.max(impact, minImpact);
  const effectiveRadius = Math.hypot(z, effectiveImpact);

  // For a source behind the gravitating mass, r + z suffers catastrophic
  // cancellation. The equivalent b^2/(r-z) form remains well conditioned.
  const rPlusZ = z < 0 ? (effectiveImpact * effectiveImpact) / (effectiveRadius - z) : effectiveRadius + z;
  return shapiroDelayFromGeometry({ ...params, rMag: effectiveRadius }, rPlusZ, impactFloorEngaged);
}

function shapiroDelayFromGeometry(
  params: { mu: number; c: number; rMag: number },
  rPlusZ: number,
  impactFloorEngaged: boolean,
): ShapiroDelayEvaluation {
  const arg = Math.max(Number.MIN_VALUE, rPlusZ / params.rMag);
  if (!Number.isFinite(arg)) return { delaySec: 0, impactFloorEngaged };

  // This is a geometry-dependent relative delay; its arbitrary additive
  // constant is fixed by dividing by r. Superior conjunction (small impact)
  // must increase the delay, hence the leading minus sign.
  const delay = -(2 * params.mu * Math.log(arg)) / (params.c * params.c * params.c);
  return {
    delaySec: finiteOrZero(delay),
    impactFloorEngaged,
  };
}

function hasShapiroMasses(masses: ShapiroMass[]): boolean {
  return Array.isArray(masses) && masses.length > 0;
}

function evaluateShapiroMassContribution(
  params: {
    rBody: Vec3;
    observerDir: Vec3;
    c: number;
    minImpact?: number;
  },
  mass: ShapiroMass | undefined | null,
): ShapiroDelayEvaluation {
  if (!mass || !vIsFinite(mass.r)) return zeroShapiroEvaluation();
  return evaluateShapiroDelay({
    r: relativeShapiroPosition(params.rBody, mass.r),
    observerDir: params.observerDir,
    mu: mass.mu,
    c: params.c,
    minImpact: params.minImpact,
  });
}

function relativeShapiroPosition(rBody: Vec3, center: Vec3): Vec3 {
  return {
    x: rBody.x - center.x,
    y: rBody.y - center.y,
    z: rBody.z - center.z,
  };
}

function nonNegativeFiniteOrDefault(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : fallback;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
