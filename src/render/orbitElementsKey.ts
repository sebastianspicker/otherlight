import type { OrbitElements } from "../core/types";

type OrbitElementsKeyEntry = {
  a: number;
  e: number;
  inc: number;
  Omega: number;
  omega: number;
  period: number;
  t0: number;
  key: string;
};

const orbitElementsKeyCache = new WeakMap<OrbitElements, OrbitElementsKeyEntry>();

/**
 * Mix a float value into a 32-bit hash seed using xorshift-style bit mixing.
 * Quantizes to a stable integer at ~9 decimal places of precision, which is
 * more than sufficient for orbit-path cache discrimination.
 */
function mixFloat(seed: number, v: number): number {
  const bits = Number.isFinite(v) ? Math.round(v * 1e9) | 0 : 0x7fffffff;
  let h = Math.imul(seed ^ bits, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return h ^ (h >>> 16);
}

/**
 * Compute a compact, collision-resistant string key for an OrbitElements object.
 * Uses two independent 32-bit hashes (64-bit combined) with Math.imul bit mixing.
 * Much cheaper than the previous toFixed(12).join('|') approach:
 * - 7 multiply+mix operations instead of 7 toFixed(12) calls and a string join.
 * - Output is a ~22-char "h1:h2" string instead of ~100-char toFixed string.
 */
function hashOrbitElements(el: OrbitElements): string {
  let h1 = 0x9e3779b9;
  let h2 = 0x6c62272e;
  h1 = mixFloat(h1, el.a);
  h1 = mixFloat(h1, el.e);
  h1 = mixFloat(h1, el.inc);
  h1 = mixFloat(h1, el.Omega);
  h2 = mixFloat(h2, el.omega);
  h2 = mixFloat(h2, el.period);
  h2 = mixFloat(h2, el.t0);
  return `${h1 >>> 0}:${h2 >>> 0}`;
}

export function orbitElementsKey(el: OrbitElements): string {
  const cached = orbitElementsKeyCache.get(el);
  if (cached && cachedOrbitElementsMatch(cached, el)) {
    return cached.key;
  }

  // Compute a compact numeric hash key for this orbit configuration.
  // hashOrbitElements uses Math.imul bit-mixing — much cheaper than
  // toFixed(12).join('|') for the cache-miss path.
  const key = hashOrbitElements(el);
  orbitElementsKeyCache.set(el, {
    a: el.a,
    e: el.e,
    inc: el.inc,
    Omega: el.Omega,
    omega: el.omega,
    period: el.period,
    t0: el.t0,
    key,
  });
  return key;
}

function cachedOrbitElementsMatch(cached: OrbitElementsKeyEntry, el: OrbitElements): boolean {
  return cachedOrbitGeometryMatch(cached, el) && cachedOrbitTimingMatch(cached, el);
}

function cachedOrbitGeometryMatch(cached: OrbitElementsKeyEntry, el: OrbitElements): boolean {
  return cached.a === el.a && cached.e === el.e && cached.inc === el.inc && cached.Omega === el.Omega;
}

function cachedOrbitTimingMatch(cached: OrbitElementsKeyEntry, el: OrbitElements): boolean {
  return cached.omega === el.omega && cached.period === el.period && cached.t0 === el.t0;
}
