import type { OrbitElements } from "../../core/types";
import type { Vec3 } from "../../physics/vec3";
import {
  NBODY_CACHE_MAX,
  type NBodyCacheEntry,
  type NBodyPerturberResolved,
  type NBodyState,
  type ResolvedNBodyConfig,
} from "./types";

function cloneVec3(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function cloneState(s: NBodyState): NBodyState {
  return {
    t: s.t,
    rS: cloneVec3(s.rS),
    vS: cloneVec3(s.vS),
    rP: cloneVec3(s.rP),
    vP: cloneVec3(s.vP),
    rM: cloneVec3(s.rM),
    vM: cloneVec3(s.vM),
    perturbers: (s.perturbers ?? []).map((p) => ({
      r: cloneVec3(p.r),
      v: cloneVec3(p.v),
    })),
  };
}

function normalizeOrbitKey(el: OrbitElements): string {
  return [el.a, el.e, el.inc, el.Omega, el.omega, el.period, el.t0]
    .map((v) => (Number.isFinite(v) ? v.toFixed(12) : "nan"))
    .join(",");
}

function stringifyDeterministic(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stringifyDeterministic).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const parts = keys.map(
    (k) => JSON.stringify(k) + ":" + stringifyDeterministic((obj as Record<string, unknown>)[k]),
  );
  return "{" + parts.join(",") + "}";
}

export function makeCacheKey(
  cfg: ResolvedNBodyConfig,
  planetEl: OrbitElements,
  moonEl: OrbitElements,
  perturbers: NBodyPerturberResolved[],
): string {
  return stringifyDeterministic({
    cfg: {
      muStar: cfg.muStar,
      muPlanet: cfg.muPlanet,
      muMoon: cfg.muMoon,
      dtMaxAbs: cfg.dtMaxAbs,
      softening: cfg.softening,
      throwOnOverlap: cfg.throwOnOverlap,
      relativity: { grOn: cfg.relativity.grOn, c: cfg.relativity.c },
      integrator: cfg.integrator,
      collision: cfg.collision,
    },
    planet: normalizeOrbitKey(planetEl),
    moon: normalizeOrbitKey(moonEl),
    perturbers: perturbers.map((p) => ({
      mu: p.mu,
      orbit: normalizeOrbitKey(p.orbit),
    })),
  });
}

export function findClosestEntry(entries: NBodyCacheEntry[], t: number): NBodyCacheEntry | null {
  if (entries.length === 0) return null;
  let best = entries[0];
  let bestDist = Math.abs(t - best.t);

  for (let i = 1; i < entries.length; i++) {
    const d = Math.abs(t - entries[i].t);
    if (d < bestDist) {
      bestDist = d;
      best = entries[i];
    }
  }

  // Mark as recently accessed for LRU eviction.
  best.lastAccess = Date.now();
  return best;
}

export function storeEntry(entries: NBodyCacheEntry[], state: NBodyState): void {
  const eps = 1e-9;
  for (let i = 0; i < entries.length; i++) {
    if (Math.abs(entries[i].t - state.t) <= eps) {
      entries[i] = { t: state.t, state: cloneState(state), lastAccess: Date.now() };
      return;
    }
  }

  entries.push({ t: state.t, state: cloneState(state), lastAccess: Date.now() });

  if (entries.length <= NBODY_CACHE_MAX) return;

  // LRU eviction: remove the least recently accessed entry to maintain
  // a spread of cached time points instead of clustering near current time.
  let lruIdx = 0;
  let lruTime = entries[0].lastAccess ?? 0;
  for (let i = 1; i < entries.length; i++) {
    const access = entries[i].lastAccess ?? 0;
    if (access < lruTime) {
      lruTime = access;
      lruIdx = i;
    }
  }
  entries.splice(lruIdx, 1);
}
