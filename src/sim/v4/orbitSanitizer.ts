import type { OrbitElements } from "../../core/types";

const DEFAULT_BINARY_ORBIT: OrbitElements = {
  a: 1,
  e: 0,
  inc: Math.PI / 2,
  Omega: 0,
  omega: 0,
  period: 1,
  t0: 0,
};

function finiteOrDefault(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function finitePositiveOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteEccentricityOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1 ? value : fallback;
}

type OrbitCandidate = Partial<Record<keyof OrbitElements, unknown>>;

function isOrbitCandidate(orbit: unknown): orbit is OrbitCandidate {
  return typeof orbit !== "function" && Boolean(orbit) && typeof orbit === "object";
}

function hasValidScaleAndShape(src: OrbitCandidate): boolean {
  return isFinitePositive(src.a) && isFiniteEccentricity(src.e);
}

function hasValidAngles(src: OrbitCandidate): boolean {
  return isFiniteNumber(src.inc) && isFiniteNumber(src.Omega) && isFiniteNumber(src.omega);
}

function hasValidTiming(src: OrbitCandidate): boolean {
  return isFinitePositive(src.period) && isFiniteNumber(src.t0);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFinitePositive(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isFiniteEccentricity(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value < 1;
}

export function isValidStaticOrbit(orbit: unknown): orbit is OrbitElements {
  if (!isOrbitCandidate(orbit)) return false;
  return hasValidScaleAndShape(orbit) && hasValidAngles(orbit) && hasValidTiming(orbit);
}

export function sanitizeStaticOrbit(
  orbit: unknown,
  fallback: OrbitElements = DEFAULT_BINARY_ORBIT,
): OrbitElements {
  if (typeof orbit === "function" || !orbit || typeof orbit !== "object") return { ...fallback };

  const src = orbit as Partial<OrbitElements>;
  return {
    a: finitePositiveOrDefault(src.a, fallback.a),
    e: finiteEccentricityOrDefault(src.e, fallback.e),
    inc: finiteOrDefault(src.inc, fallback.inc),
    Omega: finiteOrDefault(src.Omega, fallback.Omega),
    omega: finiteOrDefault(src.omega, fallback.omega),
    period: finitePositiveOrDefault(src.period, fallback.period),
    t0: finiteOrDefault(src.t0, fallback.t0),
  };
}

export function defaultBinaryOrbit(): OrbitElements {
  return { ...DEFAULT_BINARY_ORBIT };
}
