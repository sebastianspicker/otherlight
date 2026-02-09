// src/sim/dynamics.ts
//
// N-body dynamics orchestration and snapshot caching for star+planet+moon(+perturbers).
// Uses a velocity-Verlet integrator with star reflex motion and mutually coupled perturbers.

import type { OrbitElements, SystemParams } from "../core/types";
import { G_SI, isFinitePositive } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { VEC3ZERO, vAdd, vAddScaled, vDot, vIsFinite, vLenSq, vScale, vSub } from "../physics/vec3";
import { perifocalToInertial } from "../physics/frames";
import { radiusFromE, solveKeplerE, trueAnomalyFromE } from "../physics/kepler";
import { normalizeRelativityParams } from "../physics/relativity";
import { resolveOrbitElements } from "./orbits";
import { resolveEnabledNBodyPlanetMoonConfig, type NBodyState } from "../experimental/physics/nbody";

type PerturberResolved = {
  mu: number;
  orbit: OrbitElements;
};

type ResolvedNBodyConfig = {
  muStar: number;
  muPlanet: number;
  muMoon: number;
  dtMaxAbs: number;
  softening: number;
  throwOnOverlap: boolean;
  perturbers: PerturberResolved[];
  relativity: { grOn: boolean; c: number };
};

type NBodyCacheEntry = {
  t: number;
  state: NBodyState;
};

const CACHE_MAX = 24;
const ANCHOR_TIME_SEC = 0;

let cacheKey = "";
let cache: NBodyCacheEntry[] = [];

function cloneVec3(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

function cloneState(s: NBodyState): NBodyState {
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

/** Stringify with sorted keys so cache key is deterministic across engines and refactors. */
function stringifyDeterministic(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stringifyDeterministic).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const parts = keys.map(
    (k) => JSON.stringify(k) + ":" + stringifyDeterministic((obj as Record<string, unknown>)[k]),
  );
  return "{" + parts.join(",") + "}";
}

function makeCacheKey(
  cfg: ResolvedNBodyConfig,
  planetEl: OrbitElements,
  moonEl: OrbitElements,
  perturbers: PerturberResolved[],
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
    },
    planet: normalizeOrbitKey(planetEl),
    moon: normalizeOrbitKey(moonEl),
    perturbers: perturbers.map((p) => ({
      mu: p.mu,
      orbit: normalizeOrbitKey(p.orbit),
    })),
  });
}

function normalizeSoftening(softening: number): { eps: number; eps2: number } {
  const eps = Number.isFinite(softening) ? Math.max(0, softening) : 0;
  return { eps, eps2: eps * eps };
}

type BodyArrays = {
  positions: Vec3[];
  velocities: Vec3[];
  mus: number[];
};

function buildBodyArrays(state: NBodyState, cfg: ResolvedNBodyConfig): BodyArrays {
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

function unpackBodyArrays(params: {
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

function computeAccelerations(params: {
  positions: Vec3[];
  mus: number[];
  eps2: number;
  throwOnOverlap: boolean;
}): Vec3[] {
  const { positions, mus, eps2, throwOnOverlap } = params;
  const n = positions.length;
  const acc: Vec3[] = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dr = vSub(positions[j], positions[i]);
      const r2 = vLenSq(dr);

      if (!(r2 > 0) || !Number.isFinite(r2)) {
        if (throwOnOverlap && eps2 === 0) {
          throw new Error(
            "nbody accel: overlap detected with zero softening (check dt or initial conditions).",
          );
        }
        continue;
      }

      const d2 = r2 + eps2;
      if (!(d2 > 0) || !Number.isFinite(d2)) {
        if (throwOnOverlap) {
          throw new Error("nbody accel: invalid squared distance (non-finite).");
        }
        continue;
      }

      const invR = 1 / Math.sqrt(d2);
      const invR3 = invR * invR * invR;

      const muI = mus[i];
      const muJ = mus[j];

      acc[i] = vAdd(acc[i], vScale(dr, muJ * invR3));
      acc[j] = vAdd(acc[j], vScale(dr, -muI * invR3));
    }
  }

  return acc;
}

function grSchwarzschildAccelStarOnly(params: {
  rRel: Vec3;
  vRel: Vec3;
  muStar: number;
  c: number;
  eps2: number;
}): Vec3 {
  // 1PN Schwarzschild correction for a test body around a central mass.
  const { rRel, vRel, muStar, c, eps2 } = params;
  if (!(Number.isFinite(muStar) && muStar > 0)) return VEC3ZERO;
  if (!(Number.isFinite(c) && c > 0)) return VEC3ZERO;

  const r2 = vLenSq(rRel) + eps2;
  if (!(r2 > 0) || !Number.isFinite(r2)) return VEC3ZERO;

  const r = Math.sqrt(r2);
  if (!(r > 0) || !Number.isFinite(r)) return VEC3ZERO;

  const v2 = vLenSq(vRel);
  if (!Number.isFinite(v2)) return VEC3ZERO;

  const rv = vDot(rRel, vRel);
  if (!Number.isFinite(rv)) return VEC3ZERO;

  const c2 = c * c;
  if (!(c2 > 0) || !Number.isFinite(c2)) return VEC3ZERO;

  const scale = muStar / (c2 * r2 * r);
  const termR = (4 * muStar) / r - v2;
  const termV = 4 * rv;

  return vAdd(vScale(rRel, scale * termR), vScale(vRel, scale * termV));
}

function applyGrCorrections(params: {
  acc: Vec3[];
  positions: Vec3[];
  velocities: Vec3[];
  mus: number[];
  cfg: ResolvedNBodyConfig;
  eps2: number;
}): void {
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
}

function integrateStep(params: { state: NBodyState; dt: number; cfg: ResolvedNBodyConfig }): NBodyState {
  const { state, dt, cfg } = params;
  if (dt === 0) return cloneState(state);

  const { eps2 } = normalizeSoftening(cfg.softening);
  const { positions, velocities, mus } = buildBodyArrays(state, cfg);
  const a0 = computeAccelerations({
    positions,
    mus,
    eps2,
    throwOnOverlap: cfg.throwOnOverlap,
  });
  applyGrCorrections({ acc: a0, positions, velocities, mus, cfg, eps2 });
  const dt2 = dt * dt;

  const positions1 = positions.map((r, i) =>
    vAdd(vAddScaled(r, velocities[i], dt), vScale(a0[i], 0.5 * dt2)),
  );

  const a1 = computeAccelerations({
    positions: positions1,
    mus,
    eps2,
    throwOnOverlap: cfg.throwOnOverlap,
  });
  const velocitiesForA1 = velocities.map((v, i) => vAdd(v, vScale(a0[i], dt)));
  applyGrCorrections({
    acc: a1,
    positions: positions1,
    velocities: velocitiesForA1,
    mus,
    cfg,
    eps2,
  });
  const velocities1 = velocities.map((v, i) => vAdd(v, vScale(vAdd(a0[i], a1[i]), 0.5 * dt)));

  const out = unpackBodyArrays({
    t: state.t + dt,
    positions: positions1,
    velocities: velocities1,
    perturberCount: cfg.perturbers.length,
  });

  if (
    !Number.isFinite(out.t) ||
    !vIsFinite(out.rS) ||
    !vIsFinite(out.vS) ||
    !vIsFinite(out.rP) ||
    !vIsFinite(out.vP) ||
    !vIsFinite(out.rM) ||
    !vIsFinite(out.vM)
  ) {
    throw new Error("nbody integrator produced non-finite state (dt too large or parameters pathological).");
  }

  for (let i = 0; i < out.perturbers.length; i++) {
    if (!vIsFinite(out.perturbers[i].r) || !vIsFinite(out.perturbers[i].v)) {
      throw new Error(
        "nbody integrator produced non-finite perturber state (dt too large or parameters pathological).",
      );
    }
  }

  return out;
}

function integrateToTime(params: {
  state: NBodyState;
  tTarget: number;
  cfg: ResolvedNBodyConfig;
  maxSteps?: number;
}): NBodyState {
  const { state, tTarget, cfg } = params;
  const dtMaxAbs = cfg.dtMaxAbs;
  if (!Number.isFinite(dtMaxAbs) || dtMaxAbs <= 0) {
    throw new Error("nbody dtMax must be > 0.");
  }

  const maxSteps = Number.isFinite(params.maxSteps) ? Math.max(1, Math.floor(params.maxSteps!)) : 2_000_000;

  let s = cloneState(state);
  for (let steps = 0; steps < maxSteps; steps++) {
    const remaining = tTarget - s.t;
    if (remaining === 0) return s;

    const dir = Math.sign(remaining);
    const dtStepMag = Math.min(dtMaxAbs, Math.abs(remaining));
    const dt = dir * dtStepMag;

    s = integrateStep({ state: s, dt, cfg });
  }

  throw new Error("nbody integrateToTime exceeded maxSteps (check dtMax).");
}

function pvFromResolvedElements(el: OrbitElements, t: number, muCentral: number): { r: Vec3; v: Vec3 } {
  const n = (2 * Math.PI) / el.period;
  const M = n * (t - el.t0);
  const E = solveKeplerE(M, el.e);
  const nu = trueAnomalyFromE(E, el.e);
  const r = radiusFromE(el.a, el.e, E);

  const rPQW: Vec3 = { x: r * Math.cos(nu), y: r * Math.sin(nu), z: 0 };
  const p = el.a * (1 - el.e * el.e);
  const vScaleFac = Math.sqrt(muCentral / p);
  const vPQW: Vec3 = {
    x: -Math.sin(nu) * vScaleFac,
    y: (el.e + Math.cos(nu)) * vScaleFac,
    z: 0,
  };

  return {
    r: perifocalToInertial(rPQW, el.Omega, el.inc, el.omega),
    v: perifocalToInertial(vPQW, el.Omega, el.inc, el.omega),
  };
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

  const { r: rBary, v: vBary } = pvFromResolvedElements(planetEl, t0, muStarSystem);
  const { r: rRel, v: vRel } = pvFromResolvedElements(moonEl, t0, muPM);

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
    return pvFromResolvedElements(pert.orbit, t0, muCentral);
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

function resolveNBodyConfig(params: SystemParams): { cfg: ResolvedNBodyConfig; key: string } | null {
  const nbody = params.dynamics?.nbodyPlanetMoon;
  const cfg = resolveEnabledNBodyPlanetMoonConfig(nbody, {
    onInvalid: "throw",
    masses: {
      star: params.star?.m,
      planet: params.planet?.m,
      moon: params.moon?.m,
    },
  });
  if (!cfg) return null;

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

  const planetEl = resolveOrbitElements(params.planet.orbit, ANCHOR_TIME_SEC, "planet.orbit");
  const moonEl = resolveOrbitElements(
    params.moon.orbitAroundPlanet,
    ANCHOR_TIME_SEC,
    "moon.orbitAroundPlanet",
  );

  const perturbers: PerturberResolved[] = [];
  const extra = Array.isArray(nbody?.perturbers) ? nbody!.perturbers! : [];

  for (let i = 0; i < extra.length; i++) {
    const p = extra[i] as any;
    if (!p || p.enabled === false) continue;
    const mu = isFinitePositive(p.mu) ? p.mu : isFinitePositive(p.m) ? G_SI * p.m : undefined;
    if (!isFinitePositive(mu)) continue;
    if (!p.orbit) continue;
    if (typeof p.orbit === "function") {
      throw new Error("nbody perturbers require static orbit elements (initial conditions).");
    }
    const el = resolveOrbitElements(
      p.orbit,
      ANCHOR_TIME_SEC,
      `dynamics.nbodyPlanetMoon.perturbers[${i}].orbit`,
    );
    perturbers.push({ mu, orbit: el });
  }

  const rel = normalizeRelativityParams(params.dynamics?.relativity);
  const relativity = {
    grOn: Boolean(rel.enabled && rel.grPrecession),
    c: rel.c,
  };

  const resolved: ResolvedNBodyConfig = {
    muStar: cfg.muStar,
    muPlanet: cfg.muPlanet,
    muMoon: cfg.muMoon,
    dtMaxAbs: cfg.dtMaxAbs,
    softening: cfg.softening,
    throwOnOverlap: cfg.throwOnOverlap,
    perturbers,
    relativity,
  };

  const key = makeCacheKey(resolved, planetEl, moonEl, perturbers);
  return { cfg: resolved, key };
}

function findClosestEntry(entries: NBodyCacheEntry[], t: number): NBodyCacheEntry | null {
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

  return best;
}

function storeEntry(entries: NBodyCacheEntry[], state: NBodyState): void {
  const eps = 1e-9;
  for (let i = 0; i < entries.length; i++) {
    if (Math.abs(entries[i].t - state.t) <= eps) {
      entries[i] = { t: state.t, state: cloneState(state) };
      return;
    }
  }

  entries.push({ t: state.t, state: cloneState(state) });

  if (entries.length <= CACHE_MAX) return;

  // Drop the entry farthest from the newest state time.
  let worstIdx = 0;
  let worstDist = Math.abs(entries[0].t - state.t);
  for (let i = 1; i < entries.length; i++) {
    const d = Math.abs(entries[i].t - state.t);
    if (d > worstDist) {
      worstDist = d;
      worstIdx = i;
    }
  }
  entries.splice(worstIdx, 1);
}

export function isNBodyEnabled(params: SystemParams): boolean {
  return Boolean(params.dynamics?.nbodyPlanetMoon?.enabled);
}

export function getNBodyStateAt(params: SystemParams, t: number): { state: NBodyState; rBary: Vec3 } | null {
  if (!Number.isFinite(t)) throw new Error("getNBodyStateAt: t must be finite.");

  const resolved = resolveNBodyConfig(params);
  if (!resolved) return null;

  const { cfg, key } = resolved;

  if (key !== cacheKey || cache.length === 0) {
    const init = computeInitialState(params, cfg, ANCHOR_TIME_SEC);
    cacheKey = key;
    cache = [{ t: init.t, state: cloneState(init) }];
  }

  const base = findClosestEntry(cache, t) ?? cache[0];
  const state = integrateToTime({ state: base.state, tTarget: t, cfg });

  storeEntry(cache, state);

  const muTot = cfg.muPlanet + cfg.muMoon;
  const hasMu = Number.isFinite(muTot) && muTot > 0;
  const rBaryAbs = hasMu
    ? vScale(vAdd(vScale(state.rP, cfg.muPlanet), vScale(state.rM, cfg.muMoon)), 1 / muTot)
    : VEC3ZERO;

  const rBary = hasMu ? vSub(rBaryAbs, state.rS) : VEC3ZERO;

  return { state, rBary };
}
