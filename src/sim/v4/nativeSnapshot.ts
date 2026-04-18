// src/sim/v4/nativeSnapshot.ts
//
// Builds a NativeSnapshot — the positions, velocities, and metadata of every
// body in the system at a given observer time. Snapshot construction is pure;
// it does not compute photometry.

import { projectToSky } from "../../physics/frames";
import { muFromPeriodAndA, type SolveKeplerEOptions } from "../../physics/kepler";
import type { Vec3 } from "../../physics/vec3";
import { vAdd, vScale, vSub } from "../../physics/vec3";
import { posFromResolvedElements, stateFromResolvedElements } from "../orbits";
import {
  assertScientificBrowserSnapshotInputs,
  finiteOrDefault,
  hierarchyParentMap,
  keplerOptionsForExecutionMode,
  normalizeObserverDir,
  safeBodyRadius,
} from "./nativeSnapshotHelpers";
import type { MoonBodyV4, PlanetBodyV4, SimulationConfigV4, StarBodyV4 } from "./types";
import { resolveDetachedBinaryLuminosities } from "../../photometry/stellarBandFlux";
import { createScientificBrowserRuntimeError } from "./scientificErrors";

type NativeBodyKind = "star" | "planet" | "moon";

export type NativeBodyState = {
  id: string;
  kind: NativeBodyKind;
  r: number;
  m: number;
  luminosity: number;
  active: boolean;
  parentId?: string;
  rAbs: Vec3;
  vAbs: Vec3;
  sky: { x: number; y: number; z: number };
  source: StarBodyV4 | PlanetBodyV4 | MoonBodyV4;
};

export type NativeSnapshot = {
  observerDir: Vec3;
  bodies: NativeBodyState[];
  stars: NativeBodyState[];
  planets: NativeBodyState[];
  moons: NativeBodyState[];
  byId: Map<string, NativeBodyState>;
};

export type ConservationBaseline = {
  energy?: number;
  angularMomentum?: number;
};

export function orbitStateAt(
  el: { a: number; e: number; inc: number; Omega: number; omega: number; period: number; t0: number },
  t: number,
  keplerOpts?: SolveKeplerEOptions,
): {
  r: Vec3;
  v: Vec3;
} {
  const mu = muFromPeriodAndA(el.period, el.a);
  if (Number.isFinite(mu) && mu > 0) {
    return stateFromResolvedElements(el, t, mu, "v4.orbit", keplerOpts);
  }
  // Fallback: central finite differences when mu cannot be derived (degenerate orbit).
  const dt = Math.max(0.01, el.period * 1e-4);
  const r = posFromResolvedElements(el, t, "v4.orbit", keplerOpts);
  const rp = posFromResolvedElements(el, t + dt, "v4.orbit", keplerOpts);
  const rm = posFromResolvedElements(el, t - dt, "v4.orbit", keplerOpts);
  return { r, v: vScale(vSub(rp, rm), 1 / (2 * dt)) };
}

export function buildNativeSnapshot(config: SimulationConfigV4, tObsSec: number): NativeSnapshot {
  assertScientificBrowserSnapshotInputs(config);
  const observerDir = normalizeObserverDir(config);
  const keplerOpts = keplerOptionsForExecutionMode(config.runtime?.executionMode);
  const byId = new Map<string, NativeBodyState>();
  const stars: NativeBodyState[] = [];
  const planets: NativeBodyState[] = [];
  const moons: NativeBodyState[] = [];
  const hmap = hierarchyParentMap(config);

  const [starA, starB] = config.bodies.stars;
  const binary = orbitStateAt(config.orbits.binary, tObsSec, keplerOpts);
  const mA = finiteOrDefault(starA.m, 0);
  const mB = finiteOrDefault(starB.m, 0);
  const mTot = mA > 0 && mB > 0 ? mA + mB : 0;
  const wA = mTot > 0 ? -mB / mTot : 0;
  const wB = mTot > 0 ? mA / mTot : 1;

  const fallbackPassband =
    config.runtime?.executionMode === "scientific-browser"
      ? undefined
      : config.photometry?.limbDarkeningModel?.bandpass;
  const detachedBinaryLuminosities = resolveDetachedBinaryLuminosities({
    primary: starA,
    secondary: starB,
    fallbackPassband,
    secondaryFallbackLuminosityScale:
      config.runtime?.executionMode === "scientific-browser"
        ? 0
        : config.mode === "detached-binary-lab"
          ? 0.3
          : 0,
  });
  if (
    config.runtime?.executionMode === "scientific-browser" &&
    config.mode === "detached-binary-lab" &&
    detachedBinaryLuminosities.source !== "physical-bandpass"
  ) {
    throw createScientificBrowserRuntimeError({
      stage: "native-inputs",
      code: "SCB_BINARY_PHOTOMETRY_FALLBACK",
      summary: "native detached-binary scientific-browser snapshot requires physical bandpass weighting",
      details: [
        "detached-binary scientific-browser native snapshot rejects compatibility luminosity scaling",
        "provide explicit per-star physical photometry inputs (radius, teffK, passband)",
      ],
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
      },
    });
  }
  const lumA = detachedBinaryLuminosities.primary;
  const lumBraw = detachedBinaryLuminosities.secondary;
  const starBActive = config.mode === "detached-binary-lab" || lumBraw > 0;

  const starAState: NativeBodyState = {
    id: starA.id,
    kind: "star",
    r: safeBodyRadius(starA),
    m: Math.max(0, mA),
    luminosity: lumA,
    active: true,
    rAbs: vScale(binary.r, wA),
    vAbs: vScale(binary.v, wA),
    sky: projectToSky(vScale(binary.r, wA), observerDir),
    source: starA,
  };
  const starBState: NativeBodyState = {
    id: starB.id,
    kind: "star",
    r: starBActive ? safeBodyRadius(starB) : 0,
    m: Math.max(0, mB),
    luminosity: starBActive ? lumBraw : 0,
    active: starBActive,
    rAbs: vScale(binary.r, wB),
    vAbs: vScale(binary.v, wB),
    sky: projectToSky(vScale(binary.r, wB), observerDir),
    source: starB,
  };
  byId.set(starAState.id, starAState);
  byId.set(starBState.id, starBState);
  stars.push(starAState, starBState);

  const requireKnownParent = (
    bodyKind: "planet" | "moon",
    bodyId: string,
    parentId?: string,
  ): NativeBodyState | undefined => {
    if (!parentId) {
      if (bodyKind === "moon") {
        if (config.runtime?.executionMode === "scientific-browser") {
          throw createScientificBrowserRuntimeError({
            stage: "native-inputs",
            code: "SCB_INVALID_NATIVE_INPUTS",
            summary: "native snapshot inputs are invalid for scientific-browser execution",
            details: [`moon "${bodyId}" is missing a parent planet reference`],
            context: {
              executionMode: config.runtime?.executionMode ?? "interactive",
              runtimeMode: config.runtime?.mode ?? "realtime",
            },
          });
        }
        throw new Error(`buildNativeSnapshot: moon "${bodyId}" is missing a parent planet reference.`);
      }
      return undefined;
    }
    const parent = byId.get(parentId);
    if (!parent) {
      if (config.runtime?.executionMode === "scientific-browser") {
        throw createScientificBrowserRuntimeError({
          stage: "native-inputs",
          code: "SCB_INVALID_NATIVE_INPUTS",
          summary: "native snapshot inputs are invalid for scientific-browser execution",
          details: [`unknown parent "${parentId}" for ${bodyKind} "${bodyId}"`],
          context: {
            executionMode: config.runtime?.executionMode ?? "interactive",
            runtimeMode: config.runtime?.mode ?? "realtime",
          },
        });
      }
      throw new Error(`buildNativeSnapshot: unknown parent "${parentId}" for ${bodyKind} "${bodyId}".`);
    }
    return parent;
  };

  for (const p of config.bodies.planets) {
    const rel = orbitStateAt(p.orbit, tObsSec, keplerOpts);
    const parentFromHierarchy = hmap.get(p.id);
    const parentId =
      p.parentSystem === "circumbinary" ? undefined : (p.parentStarId ?? parentFromHierarchy ?? starA.id);
    const parent = requireKnownParent("planet", p.id, parentId);
    const rBase = parent ? parent.rAbs : ({ x: 0, y: 0, z: 0 } as Vec3);
    const vBase = parent ? parent.vAbs : ({ x: 0, y: 0, z: 0 } as Vec3);
    const rAbs = vAdd(rBase, rel.r);
    const vAbs = vAdd(vBase, rel.v);
    const st: NativeBodyState = {
      id: p.id,
      kind: "planet",
      r: safeBodyRadius(p),
      m: Math.max(0, finiteOrDefault(p.m, 0)),
      luminosity: 0,
      active: true,
      parentId,
      rAbs,
      vAbs,
      sky: projectToSky(rAbs, observerDir),
      source: p,
    };
    byId.set(st.id, st);
    planets.push(st);
  }

  for (const m of config.bodies.moons) {
    const rel = orbitStateAt(m.orbit, tObsSec, keplerOpts);
    const parentFromHierarchy = hmap.get(m.id);
    const parentId = m.parentPlanetId ?? parentFromHierarchy;
    const parent = requireKnownParent("moon", m.id, parentId);
    const rBase = parent ? parent.rAbs : ({ x: 0, y: 0, z: 0 } as Vec3);
    const vBase = parent ? parent.vAbs : ({ x: 0, y: 0, z: 0 } as Vec3);
    const rAbs = vAdd(rBase, rel.r);
    const vAbs = vAdd(vBase, rel.v);
    const st: NativeBodyState = {
      id: m.id,
      kind: "moon",
      r: safeBodyRadius(m),
      m: Math.max(0, finiteOrDefault(m.m, 0)),
      luminosity: 0,
      active: true,
      parentId,
      rAbs,
      vAbs,
      sky: projectToSky(rAbs, observerDir),
      source: m,
    };
    byId.set(st.id, st);
    moons.push(st);
  }

  return {
    observerDir,
    bodies: [...stars, ...planets, ...moons],
    stars,
    planets,
    moons,
    byId,
  };
}
