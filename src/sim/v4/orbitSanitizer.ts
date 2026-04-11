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

export function sanitizeStaticOrbit(
  orbit: unknown,
  fallback: OrbitElements = DEFAULT_BINARY_ORBIT,
): OrbitElements {
  if (typeof orbit === "function" || !orbit || typeof orbit !== "object") return { ...fallback };

  const src = orbit as Partial<OrbitElements>;
  return {
    a: finiteOrDefault(src.a, fallback.a),
    e: finiteOrDefault(src.e, fallback.e),
    inc: finiteOrDefault(src.inc, fallback.inc),
    Omega: finiteOrDefault(src.Omega, fallback.Omega),
    omega: finiteOrDefault(src.omega, fallback.omega),
    period: finiteOrDefault(src.period, fallback.period),
    t0: finiteOrDefault(src.t0, fallback.t0),
  };
}

export function defaultBinaryOrbit(): OrbitElements {
  return { ...DEFAULT_BINARY_ORBIT };
}
