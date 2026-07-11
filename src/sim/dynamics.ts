// src/sim/dynamics.ts
//
// N-body dynamics orchestration and snapshot caching for star+planet+moon(+perturbers).
// Public facade over src/sim/nbody/* modules.

import type { SystemParams } from "../core/types";
import { G_SI } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { VEC3ZERO, vAdd, vAddScaled, vScale, vSub } from "../physics/vec3";
import { resolveOrbitElements, stateFromResolvedElements } from "./orbits";
import { resolveNBodyConfig } from "./nbody/config";
import {
  ANCHOR_TIME_SEC,
  type NBodyCacheEntry,
  type NBodyConservationDiagnostics,
  type NBodyState,
  type ResolvedNBodyConfig,
} from "./nbody/types";
import { cloneState, findClosestEntry, makeCacheKey, storeEntry } from "./nbody/cache";
import { computeConservationDiagnostics } from "./nbody/diagnostics";
import { integrateToTimeWithConfig, unpackBodyArrays } from "./nbody/integrator";

// Module-level singleton cache.  This is shared across all callers within
// the same JS context.  Tests MUST call resetNBodyCache() in beforeEach to
// prevent cross-test contamination via stale cache entries.
let activeNBodyCacheIdentity = "";
let cache: NBodyCacheEntry[] = [];
type ResolvedNBody = NonNullable<ReturnType<typeof resolveNBodyConfig>>;

/**
 * Reset the module-level N-body cache.
 * Call this when the simulation is rebuilt with new parameters to prevent
 * stale cache hits if the key computation happens to collide.
 */
export function resetNBodyCache(): void {
  activeNBodyCacheIdentity = "";
  cache = [];
}

function splitBarycenter(params: {
  rBary: Vec3;
  vBary: Vec3;
  rRel: Vec3;
  vRel: Vec3;
  muPlanet: number;
  muMoon: number;
}): { rP: Vec3; vP: Vec3; rM: Vec3; vM: Vec3 } {
  const muTot = params.muPlanet + params.muMoon;
  if (!(muTot > 0) || !Number.isFinite(muTot)) {
    return {
      rP: params.rBary,
      vP: params.vBary,
      rM: vAdd(params.rBary, params.rRel),
      vM: vAdd(params.vBary, params.vRel),
    };
  }

  const wM = params.muMoon / muTot;
  const wP = params.muPlanet / muTot;

  return {
    rP: vAddScaled(params.rBary, params.rRel, -wM),
    vP: vAddScaled(params.vBary, params.vRel, -wM),
    rM: vAddScaled(params.rBary, params.rRel, wP),
    vM: vAddScaled(params.vBary, params.vRel, wP),
  };
}

function computeInitialState(params: SystemParams, cfg: ResolvedNBodyConfig, t0: number): NBodyState {
  if (!params.moon) {
    throw new Error("nbody enabled requires a moon configuration.");
  }

  if (typeof params.planet.orbit === "function") {
    throw new Error("nbody requires a static planet.orbit (initial conditions, not a function provider).");
  }
  if (typeof params.moon.orbitAroundPlanet === "function") {
    throw new Error(
      "nbody requires a static moon.orbitAroundPlanet (initial conditions, not a function provider).",
    );
  }

  const planetEl = resolveOrbitElements(params.planet.orbit, t0, "planet.orbit");
  const moonEl = resolveOrbitElements(params.moon.orbitAroundPlanet, t0, "moon.orbitAroundPlanet");

  const muPM = cfg.muPlanet + cfg.muMoon;
  const muStarSystem = cfg.muStar + muPM;

  const { r: rBary, v: vBary } = stateFromResolvedElements(planetEl, t0, muStarSystem, "planet.orbit");
  const { r: rRel, v: vRel } = stateFromResolvedElements(moonEl, t0, muPM, "moon.orbitAroundPlanet");

  const split = splitBarycenter({
    rBary,
    vBary,
    rRel,
    vRel,
    muPlanet: cfg.muPlanet,
    muMoon: cfg.muMoon,
  });

  const pertStates = cfg.perturbers.map((pert) => {
    const muCentral = cfg.muStar + pert.mu;
    return stateFromResolvedElements(pert.orbit, t0, muCentral, "nbody.perturber.orbit");
  });

  const positions: Vec3[] = [VEC3ZERO, split.rP, split.rM, ...pertStates.map((p) => p.r)];
  const velocities: Vec3[] = [VEC3ZERO, split.vP, split.vM, ...pertStates.map((p) => p.v)];
  const mus: number[] = [cfg.muStar, cfg.muPlanet, cfg.muMoon, ...cfg.perturbers.map((p) => p.mu)];

  let muTot = 0;
  let rSum: Vec3 = VEC3ZERO;
  let vSum: Vec3 = VEC3ZERO;
  for (let i = 0; i < mus.length; i++) {
    const mu = mus[i];
    muTot += mu;
    rSum = vAdd(rSum, vScale(positions[i], mu));
    vSum = vAdd(vSum, vScale(velocities[i], mu));
  }

  if (Number.isFinite(muTot) && muTot > 0) {
    const rCm = vScale(rSum, 1 / muTot);
    const vCm = vScale(vSum, 1 / muTot);
    for (let i = 0; i < positions.length; i++) {
      positions[i] = vSub(positions[i], rCm);
      velocities[i] = vSub(velocities[i], vCm);
    }
  }

  return unpackBodyArrays({
    t: t0,
    positions,
    velocities,
    perturberCount: cfg.perturbers.length,
  });
}

export function isNBodyEnabled(params: SystemParams): boolean {
  return Boolean(params.dynamics?.nbodyPlanetMoon?.enabled);
}

export function getNBodyStateAt(params: SystemParams, t: number): { state: NBodyState; rBary: Vec3 } | null {
  assertFiniteNBodyTime(t);

  const resolved = resolveNBodyConfig(params);
  if (!resolved) return null;

  ensureNBodyCache(params, resolved);
  const state = integrateFromClosestCache(t, resolved.cfg);

  storeEntry(cache, state);

  return { state, rBary: relativePlanetMoonBarycenter(state, resolved.cfg) };
}

function assertFiniteNBodyTime(t: number): void {
  if (!Number.isFinite(t)) throw new Error("getNBodyStateAt: t must be finite.");
}

function ensureNBodyCache(params: SystemParams, resolved: ResolvedNBody): void {
  const nextCacheIdentity = makeResolvedCacheIdentity(resolved);
  if (nextCacheIdentity === activeNBodyCacheIdentity && cache.length > 0) return;

  const init = computeInitialState(params, resolved.cfg, ANCHOR_TIME_SEC);
  activeNBodyCacheIdentity = nextCacheIdentity;
  cache = [{ t: init.t, state: cloneState(init) }];
}

function makeResolvedCacheIdentity(resolved: ResolvedNBody): string {
  const { cfg, keyInputs } = resolved;
  return makeCacheKey(cfg, keyInputs.planetEl, keyInputs.moonEl, keyInputs.perturbers);
}

function integrateFromClosestCache(t: number, cfg: ResolvedNBodyConfig): NBodyState {
  const base = findClosestEntry(cache, t) ?? cache[0];
  return integrateToTimeWithConfig({ state: base.state, tTarget: t, cfg });
}

function relativePlanetMoonBarycenter(state: NBodyState, cfg: ResolvedNBodyConfig): Vec3 {
  const muTot = cfg.muPlanet + cfg.muMoon;
  const hasMu = Number.isFinite(muTot) && muTot > 0;
  if (!hasMu) return VEC3ZERO;

  const rBaryAbs = vScale(vAdd(vScale(state.rP, cfg.muPlanet), vScale(state.rM, cfg.muMoon)), 1 / muTot);
  return vSub(rBaryAbs, state.rS);
}

export type { NBodyConservationDiagnostics } from "./nbody/types";

export function getNBodyConservationAt(params: SystemParams, t: number): NBodyConservationDiagnostics | null {
  const resolved = resolveNBodyConfig(params);
  if (!resolved) return null;
  const sampled = getNBodyStateAt(params, t);
  if (!sampled) return null;
  return computeConservationDiagnostics(sampled.state, resolved.cfg);
}

// Keep G_SI referenced for tree-shaking-stable diagnostics semantics.
void G_SI;
