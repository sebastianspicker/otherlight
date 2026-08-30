/** Materializes native-engine body snapshots in the canonical SI observer frame. */
//
// Builds a NativeSnapshot containing the positions, velocities, and metadata of every
// body in the system at a given observer time. Snapshot construction is pure;
// it does not compute photometry.

import { projectToSky } from "../../orbits/frames";
import { muFromPeriodAndA, type SolveKeplerEOptions } from "../../orbits/kepler";
import type { Vec3 } from "../../orbits/vec3";
import { vAdd, vScale, vSub } from "../../orbits/vec3";
import { posFromResolvedElements, stateFromResolvedElements } from "../orbits";
import {
  assertScientificBrowserSnapshotInputs,
  finiteOrDefault,
  hierarchyParentMap,
  keplerOptionsForExecutionMode,
  normalizeObserverDir,
  safeBodyRadius,
} from "./nativeSnapshotHelpers";
import type { MoonBodyV4, PlanetBodyV4, EducationScenarioV4, StarBodyV4 } from "./types";
import { resolveDetachedBinaryLuminosities } from "../../photometry/stellarBandFlux";
import { createScientificBrowserRuntimeError } from "./scientificErrors";

type NativeBodyKind = "star" | "planet" | "moon";

type OrbitState = {
  r: Vec3;
  v: Vec3;
};

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

type SnapshotBuildContext = {
  config: EducationScenarioV4;
  tObsSec: number;
  observerDir: Vec3;
  keplerOpts?: SolveKeplerEOptions;
  byId: Map<string, NativeBodyState>;
  stars: NativeBodyState[];
  planets: NativeBodyState[];
  moons: NativeBodyState[];
  hmap: Map<string, string>;
};

type BinaryMassWeights = {
  starA: number;
  starB: number;
};

type OrbitingBodySource = PlanetBodyV4 | MoonBodyV4;

export function orbitStateAt(
  el: { a: number; e: number; inc: number; Omega: number; omega: number; period: number; t0: number },
  t: number,
  keplerOpts?: SolveKeplerEOptions,
): OrbitState {
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

function isScientificBrowser(config: EducationScenarioV4): boolean {
  return config.runtime?.executionMode === "scientific-browser";
}

function isDetachedBinaryLab(config: EducationScenarioV4): boolean {
  return config.mode === "detached-binary-lab";
}

function zeroVec(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

function scientificBrowserContext(config: EducationScenarioV4): {
  executionMode: string;
  runtimeMode: string;
} {
  return {
    executionMode: config.runtime?.executionMode ?? "interactive",
    runtimeMode: config.runtime?.mode ?? "realtime",
  };
}

function createSnapshotContext(config: EducationScenarioV4, tObsSec: number): SnapshotBuildContext {
  assertScientificBrowserSnapshotInputs(config);
  return {
    config,
    tObsSec,
    observerDir: normalizeObserverDir(config),
    keplerOpts: keplerOptionsForExecutionMode(config.runtime?.executionMode),
    byId: new Map<string, NativeBodyState>(),
    stars: [],
    planets: [],
    moons: [],
    hmap: hierarchyParentMap(config),
  };
}

function binaryMassWeights(starA: StarBodyV4, starB: StarBodyV4): BinaryMassWeights {
  const mA = finiteOrDefault(starA.m, 0);
  const mB = finiteOrDefault(starB.m, 0);
  const mTot = mA > 0 && mB > 0 ? mA + mB : 0;
  return {
    starA: mTot > 0 ? -mB / mTot : 0,
    starB: mTot > 0 ? mA / mTot : 1,
  };
}

function detachedBinaryFallbackPassband(config: EducationScenarioV4): string | undefined {
  return isScientificBrowser(config) ? undefined : config.photometry?.limbDarkeningModel?.bandpass;
}

function secondaryFallbackLuminosityScale(config: EducationScenarioV4): number {
  if (isScientificBrowser(config)) return 0;
  return isDetachedBinaryLab(config) ? 0.3 : 0;
}

function detachedBinaryLuminosities(config: EducationScenarioV4, starA: StarBodyV4, starB: StarBodyV4) {
  return resolveDetachedBinaryLuminosities({
    primary: starA,
    secondary: starB,
    fallbackPassband: detachedBinaryFallbackPassband(config),
    secondaryFallbackLuminosityScale: secondaryFallbackLuminosityScale(config),
  });
}

function assertDetachedBinaryPhysicalLuminosities(config: EducationScenarioV4, source: string): void {
  if (!isScientificBrowser(config) || !isDetachedBinaryLab(config) || source === "physical-bandpass") return;
  throw createScientificBrowserRuntimeError({
    stage: "native-inputs",
    code: "SCB_BINARY_PHOTOMETRY_FALLBACK",
    summary: "native detached-binary scientific-browser snapshot requires physical bandpass weighting",
    details: [
      "detached-binary scientific-browser native snapshot rejects compatibility luminosity scaling",
      "provide explicit per-star physical photometry inputs (radius, teffK, passband)",
    ],
    context: scientificBrowserContext(config),
  });
}

function starStateFromBinary(
  star: StarBodyV4,
  binary: OrbitState,
  weight: number,
  luminosity: number,
  active: boolean,
  observerDir: Vec3,
): NativeBodyState {
  const rAbs = vScale(binary.r, weight);
  const vAbs = vScale(binary.v, weight);
  return {
    id: star.id,
    kind: "star",
    r: active ? safeBodyRadius(star) : 0,
    m: Math.max(0, finiteOrDefault(star.m, 0)),
    luminosity,
    active,
    rAbs,
    vAbs,
    sky: projectToSky(rAbs, observerDir),
    source: star,
  };
}

function addState(
  collection: NativeBodyState[],
  byId: Map<string, NativeBodyState>,
  state: NativeBodyState,
): void {
  byId.set(state.id, state);
  collection.push(state);
}

function addBinaryStarStates(ctx: SnapshotBuildContext): void {
  const [starA, starB] = ctx.config.bodies.stars;
  const binary = orbitStateAt(ctx.config.orbits.binary, ctx.tObsSec, ctx.keplerOpts);
  const weights = binaryMassWeights(starA, starB);
  const luminosities = detachedBinaryLuminosities(ctx.config, starA, starB);
  assertDetachedBinaryPhysicalLuminosities(ctx.config, luminosities.source);

  const starAState = starStateFromBinary(
    starA,
    binary,
    weights.starA,
    luminosities.primary,
    true,
    ctx.observerDir,
  );
  const starBActive = isDetachedBinaryLab(ctx.config) || luminosities.secondary > 0;
  const starBState = starStateFromBinary(
    starB,
    binary,
    weights.starB,
    starBActive ? luminosities.secondary : 0,
    starBActive,
    ctx.observerDir,
  );

  addState(ctx.stars, ctx.byId, starAState);
  addState(ctx.stars, ctx.byId, starBState);
}

function throwMissingMoonParent(config: EducationScenarioV4, bodyId: string): never {
  if (isScientificBrowser(config)) {
    throw createScientificBrowserRuntimeError({
      stage: "native-inputs",
      code: "SCB_INVALID_NATIVE_INPUTS",
      summary: "native snapshot inputs are invalid for scientific-browser execution",
      details: [`moon "${bodyId}" is missing a parent planet reference`],
      context: scientificBrowserContext(config),
    });
  }
  throw new Error(`buildNativeSnapshot: moon "${bodyId}" is missing a parent planet reference.`);
}

function throwUnknownParent(
  config: EducationScenarioV4,
  bodyKind: "planet" | "moon",
  bodyId: string,
  parentId: string,
): never {
  if (isScientificBrowser(config)) {
    throw createScientificBrowserRuntimeError({
      stage: "native-inputs",
      code: "SCB_INVALID_NATIVE_INPUTS",
      summary: "native snapshot inputs are invalid for scientific-browser execution",
      details: [`unknown parent "${parentId}" for ${bodyKind} "${bodyId}"`],
      context: scientificBrowserContext(config),
    });
  }
  throw new Error(`buildNativeSnapshot: unknown parent "${parentId}" for ${bodyKind} "${bodyId}".`);
}

function requireKnownParent(
  config: EducationScenarioV4,
  byId: Map<string, NativeBodyState>,
  bodyKind: "planet" | "moon",
  bodyId: string,
  parentId?: string,
): NativeBodyState | undefined {
  if (!parentId) {
    return bodyKind === "moon" ? throwMissingMoonParent(config, bodyId) : undefined;
  }
  const parent = byId.get(parentId);
  return parent ?? throwUnknownParent(config, bodyKind, bodyId, parentId);
}

function bodyBase(parent: NativeBodyState | undefined): { r: Vec3; v: Vec3 } {
  return parent ? { r: parent.rAbs, v: parent.vAbs } : { r: zeroVec(), v: zeroVec() };
}

function orbitingBodyState(
  ctx: SnapshotBuildContext,
  body: OrbitingBodySource,
  bodyKind: "planet" | "moon",
  parentId?: string,
): NativeBodyState {
  const rel = orbitStateAt(body.orbit, ctx.tObsSec, ctx.keplerOpts);
  const parent = requireKnownParent(ctx.config, ctx.byId, bodyKind, body.id, parentId);
  const base = bodyBase(parent);
  const rAbs = vAdd(base.r, rel.r);
  const vAbs = vAdd(base.v, rel.v);
  return {
    id: body.id,
    kind: bodyKind,
    r: safeBodyRadius(body),
    m: Math.max(0, finiteOrDefault(body.m, 0)),
    luminosity: 0,
    active: true,
    parentId,
    rAbs,
    vAbs,
    sky: projectToSky(rAbs, ctx.observerDir),
    source: body,
  };
}

function planetParentId(ctx: SnapshotBuildContext, p: PlanetBodyV4): string | undefined {
  const parentFromHierarchy = ctx.hmap.get(p.id);
  return p.parentSystem === "circumbinary"
    ? undefined
    : (p.parentStarId ?? parentFromHierarchy ?? ctx.config.bodies.stars[0].id);
}

function addPlanetState(ctx: SnapshotBuildContext, p: PlanetBodyV4): void {
  addState(ctx.planets, ctx.byId, orbitingBodyState(ctx, p, "planet", planetParentId(ctx, p)));
}

function addMoonState(ctx: SnapshotBuildContext, m: MoonBodyV4): void {
  const parentId = m.parentPlanetId ?? ctx.hmap.get(m.id);
  addState(ctx.moons, ctx.byId, orbitingBodyState(ctx, m, "moon", parentId));
}

function buildSnapshotResult(ctx: SnapshotBuildContext): NativeSnapshot {
  const { observerDir, stars, planets, moons, byId } = ctx;

  return {
    observerDir,
    bodies: [...stars, ...planets, ...moons],
    stars,
    planets,
    moons,
    byId,
  };
}

/**
 * Materializes the native engine's immutable body snapshot at observed seconds in its canonical SI frame.
 * This boundary keeps hierarchy resolution and observer-frame state consistent for all native calculations.
 */
export function buildNativeSnapshot(config: EducationScenarioV4, tObsSec: number): NativeSnapshot {
  const ctx = createSnapshotContext(config, tObsSec);
  addBinaryStarStates(ctx);
  ctx.config.bodies.planets.forEach((planet) => addPlanetState(ctx, planet));
  ctx.config.bodies.moons.forEach((moon) => addMoonState(ctx, moon));
  return buildSnapshotResult(ctx);
}
