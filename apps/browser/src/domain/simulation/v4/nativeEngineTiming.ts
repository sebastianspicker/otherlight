/**
 * Owns native Engine Timing support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import type {
  OrbitElements,
  StepEventTimingSolveBundle,
  StepObservables,
  StepTimingDiagnostics,
} from "../../model/types";
import { impactParameterFromProjectedSky } from "../../orbits/exomoonTiming";
import { projectToSky } from "../../orbits/frames";
import type { Vec3 } from "../../orbits/vec3";
import { vIsFinite, vLenSq, vNormalizeOrZero, vSub } from "../../orbits/vec3";
import { orbitTimingKey } from "../orbitTimingKey";
import { computeTransitReferenceEpochSec, estimateTransitEventWithDiagnostics } from "../transitTiming";
import type { MoonBodyV4, PlanetBodyV4, EducationScenarioV4 } from "./types";
import {
  buildNativeSnapshot,
  finiteOrDefault,
  orbitStateAt,
  type NativeBodyState,
  type NativeSnapshot,
} from "./nativeModel";

export function sourceOrbit(body: NativeBodyState): OrbitElements | undefined {
  const src = body.source;
  return "orbit" in src ? (src as PlanetBodyV4 | MoonBodyV4).orbit : undefined;
}

const transitReferenceEpochCache = new WeakMap<EducationScenarioV4, Map<string, number | undefined>>();

// V4 timing mirrors sim/transitTiming.ts, but works from NativeSnapshot bodies
// instead of BrowserScenarioDraft kinematics. The cache key includes full orbit fragments
// because binary-lab and scientific-browser modes can share period/t0 while
// changing orientation, hierarchy, or execution semantics.
function cachedTransitReferenceEpochSec(
  config: EducationScenarioV4,
  key: string,
  compute: () => number | undefined,
): number | undefined {
  let cache = transitReferenceEpochCache.get(config);
  if (!cache) {
    cache = new Map<string, number | undefined>();
    transitReferenceEpochCache.set(config, cache);
  }
  if (cache.has(key)) return cache.get(key);
  const value = compute();
  cache.set(key, value);
  return value;
}

type RelativeSky = { x: number; y: number; z: number };

type ProjectedSample = {
  sky: RelativeSky;
  vSky: RelativeSky;
};

type TransitEstimate = ReturnType<typeof estimateTransitEventWithDiagnostics>;

type TimingAndObservables = {
  timing?: StepTimingDiagnostics;
  eventTimingConvergence?: StepEventTimingSolveBundle;
  observables?: StepObservables;
  bPlanet?: number;
  bMoon?: number;
  relPlanetSky: RelativeSky;
  relMoonSky?: RelativeSky;
  vPlanetSky?: number;
  vPlanetSkyRef?: number;
  tdvRatio?: number;
};

function usesExactTiming(config: EducationScenarioV4): boolean {
  return config.runtime?.executionMode === "scientific-browser";
}

function relativeSky(body: NativeBodyState, starRef: NativeBodyState): RelativeSky {
  return {
    x: body.sky.x - starRef.sky.x,
    y: body.sky.y - starRef.sky.y,
    z: body.sky.z - starRef.sky.z,
  };
}

function skyVelocity(body: NativeBodyState, starRef: NativeBodyState, obs: Vec3): RelativeSky {
  return projectToSky(vSub(body.vAbs, starRef.vAbs), obs);
}

function radialVelocity(v: Vec3, obs: Vec3): number {
  const d = vNormalizeOrZero(obs);
  if (!vIsFinite(v) || vLenSq(d) <= 0) return 0;
  return -(v.x * d.x + v.y * d.y + v.z * d.z);
}

function planetBody(snap: NativeSnapshot): NativeBodyState {
  return snap.planets[0] ?? snap.stars[1];
}

function isBinaryStarBody(snap: NativeSnapshot, body: NativeBodyState): boolean {
  return body.id === snap.stars[1]?.id;
}

function exactSampleAt(
  config: EducationScenarioV4,
  obs: Vec3,
  selectBody: (snap: NativeSnapshot) => NativeBodyState | undefined,
): ((trialSec: number) => ProjectedSample | undefined) | undefined {
  if (!usesExactTiming(config)) return undefined;
  return (trialSec: number) => {
    const trialSnap = buildNativeSnapshot(config, trialSec);
    const trialStar = trialSnap.stars[0];
    const trialBody = selectBody(trialSnap);
    if (!trialStar || !trialBody) return undefined;
    return {
      sky: relativeSky(trialBody, trialStar),
      vSky: skyVelocity(trialBody, trialStar, obs),
    };
  };
}

function planetPeriodSec(
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  planet: NativeBodyState,
): number | undefined {
  return (
    sourceOrbit(planet)?.period ?? (isBinaryStarBody(snap, planet) ? config.orbits.binary.period : undefined)
  );
}

function planetT0Sec(
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  planet: NativeBodyState,
): number | undefined {
  return sourceOrbit(planet)?.t0 ?? (isBinaryStarBody(snap, planet) ? config.orbits.binary.t0 : undefined);
}

function planetReferenceEpochKey(
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  starRef: NativeBodyState,
  planet: NativeBodyState,
): string {
  return [
    "planet",
    starRef.r,
    planet.r,
    orbitTimingKey("orbit", sourceOrbit(planet) ?? config.orbits.binary),
    orbitTimingKey("binary", config.orbits.binary),
    snap.observerDir.x,
    snap.observerDir.y,
    snap.observerDir.z,
    config.mode,
    config.runtime?.executionMode ?? "",
  ].join(":");
}

function moonReferenceEpochKey(
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  starRef: NativeBodyState,
  moon: NativeBodyState,
): string {
  return [
    "moon",
    starRef.r,
    moon.r,
    orbitTimingKey("moon-orbit", sourceOrbit(moon)),
    orbitTimingKey("binary", config.orbits.binary),
    snap.observerDir.x,
    snap.observerDir.y,
    snap.observerDir.z,
    config.mode,
    config.runtime?.executionMode ?? "",
  ].join(":");
}

function planetTransitReferenceEpochSec(
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  starRef: NativeBodyState,
  planet: NativeBodyState,
  sampleAt: ((trialSec: number) => ProjectedSample | undefined) | undefined,
): number | undefined {
  return cachedTransitReferenceEpochSec(config, planetReferenceEpochKey(config, snap, starRef, planet), () =>
    computeTransitReferenceEpochSec({
      rStar: starRef.r,
      rBody: planet.r,
      periodSec: planetPeriodSec(config, snap, planet),
      t0Sec: planetT0Sec(config, snap, planet),
      sampleAt,
    }),
  );
}

function moonTransitReferenceEpochSec(
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  starRef: NativeBodyState,
  moon: NativeBodyState,
  sampleAt: ((trialSec: number) => ProjectedSample | undefined) | undefined,
): number | undefined {
  return cachedTransitReferenceEpochSec(config, moonReferenceEpochKey(config, snap, starRef, moon), () =>
    computeTransitReferenceEpochSec({
      rStar: starRef.r,
      rBody: moon.r,
      periodSec: sourceOrbit(moon)?.period,
      t0Sec: sourceOrbit(moon)?.t0,
      sampleAt,
    }),
  );
}

function estimatePlanetEvent(
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  starRef: NativeBodyState,
  planet: NativeBodyState,
  tObsSec: number,
  sampleAt: ((trialSec: number) => ProjectedSample | undefined) | undefined,
): TransitEstimate {
  const sky = relativeSky(planet, starRef);
  return estimateTransitEventWithDiagnostics({
    tObsSec,
    rStar: starRef.r,
    rBody: planet.r,
    sky,
    vSky: skyVelocity(planet, starRef, snap.observerDir),
    periodSec: planetPeriodSec(config, snap, planet),
    t0Sec: planetT0Sec(config, snap, planet),
    transitReferenceEpochSec: planetTransitReferenceEpochSec(config, snap, starRef, planet, sampleAt),
    sampleAt,
  });
}

function estimateMoonEvent(
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  starRef: NativeBodyState,
  moon: NativeBodyState | undefined,
  tObsSec: number,
  sampleAt: ((trialSec: number) => ProjectedSample | undefined) | undefined,
): TransitEstimate | undefined {
  if (!moon) return undefined;
  return estimateTransitEventWithDiagnostics({
    tObsSec,
    rStar: starRef.r,
    rBody: moon.r,
    sky: relativeSky(moon, starRef),
    vSky: skyVelocity(moon, starRef, snap.observerDir),
    periodSec: sourceOrbit(moon)?.period,
    t0Sec: sourceOrbit(moon)?.t0,
    transitReferenceEpochSec: moonTransitReferenceEpochSec(config, snap, starRef, moon, sampleAt),
    sampleAt,
  });
}

function timingDiagnostics(
  pEvent: TransitEstimate,
  mEvent: TransitEstimate | undefined,
): StepTimingDiagnostics | undefined {
  return pEvent.event || mEvent?.event
    ? {
        planetTransitCenterSec: pEvent.event?.centerSec,
        planetTransitDurationSec: pEvent.event?.durationSec,
        planetIngressSec: pEvent.event?.ingressSec,
        planetEgressSec: pEvent.event?.egressSec,
        planetTtvSec: pEvent.event?.ttvSec,
        moonTransitCenterSec: mEvent?.event?.centerSec,
        moonTransitDurationSec: mEvent?.event?.durationSec,
        moonIngressSec: mEvent?.event?.ingressSec,
        moonEgressSec: mEvent?.event?.egressSec,
        moonTtvSec: mEvent?.event?.ttvSec,
      }
    : undefined;
}

function eventTimingConvergence(
  pEvent: TransitEstimate,
  mEvent: TransitEstimate | undefined,
): StepEventTimingSolveBundle {
  return {
    planet: pEvent.diagnostics,
    moon: mEvent?.diagnostics,
  };
}

function exomoonTimingReferenceSec(config: EducationScenarioV4): number | undefined {
  const rawTRef = config.dynamics?.exomoonTimingShape?.tRef;
  if (!usesExactTiming(config)) return finiteOrDefault(rawTRef, 0);
  return typeof rawTRef === "number" && Number.isFinite(rawTRef) ? rawTRef : undefined;
}

function planetReferenceOrbit(
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  planet: NativeBodyState,
): OrbitElements {
  return isBinaryStarBody(snap, planet)
    ? config.orbits.binary
    : (sourceOrbit(planet) ?? config.orbits.binary);
}

function planetReferenceSkyVelocity(
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  planet: NativeBodyState,
): number | undefined {
  const tRef = exomoonTimingReferenceSec(config);
  if (tRef === undefined) return undefined;
  const pRelRef = orbitStateAt(planetReferenceOrbit(config, snap, planet), tRef);
  const projected = projectToSky(pRelRef.v, snap.observerDir);
  return Math.hypot(projected.x, projected.y);
}

function finiteImpactParameter(sky: RelativeSky | undefined, rStar: number): number | undefined {
  const raw = sky ? impactParameterFromProjectedSky(sky, rStar) : Number.NaN;
  return Number.isFinite(raw) ? raw : undefined;
}

function observablesForSnapshot(
  starRef: NativeBodyState,
  planet: NativeBodyState,
  moon: NativeBodyState | undefined,
  timing: StepTimingDiagnostics | undefined,
  obs: Vec3,
): StepObservables {
  return {
    rvStar: radialVelocity(starRef.vAbs, obs),
    rvPlanet: radialVelocity(planet.vAbs, obs),
    rvMoon: moon ? radialVelocity(moon.vAbs, obs) : undefined,
    astrometricOffsetStar: { x: starRef.sky.x, y: starRef.sky.y },
    timing,
  };
}

export function computeTimingAndObservables(
  config: EducationScenarioV4,
  snap: NativeSnapshot,
  tObsSec: number,
): TimingAndObservables {
  const starRef = snap.stars[0];
  const planet = planetBody(snap);
  const moon = snap.moons[0];
  const obs = snap.observerDir;
  const planetSampleAt = exactSampleAt(config, obs, planetBody);
  const moonSampleAt = exactSampleAt(config, obs, (trialSnap) => trialSnap.moons[0]);
  const pEvent = estimatePlanetEvent(config, snap, starRef, planet, tObsSec, planetSampleAt);
  const mEvent = estimateMoonEvent(config, snap, starRef, moon, tObsSec, moonSampleAt);
  const timing = timingDiagnostics(pEvent, mEvent);
  const planetVSky = skyVelocity(planet, starRef, obs);
  const vPlanetSky = Math.hypot(planetVSky.x, planetVSky.y);
  const vPlanetSkyRef = planetReferenceSkyVelocity(config, snap, planet);
  const tdvRatio = vPlanetSky > 0 && vPlanetSkyRef !== undefined ? vPlanetSkyRef / vPlanetSky : undefined;
  const relPlanetSky = relativeSky(planet, starRef);
  const relMoonSky = moon ? relativeSky(moon, starRef) : undefined;

  return {
    timing,
    observables: observablesForSnapshot(starRef, planet, moon, timing, obs),
    eventTimingConvergence: eventTimingConvergence(pEvent, mEvent),
    bPlanet: finiteImpactParameter(relPlanetSky, starRef.r),
    bMoon: finiteImpactParameter(relMoonSky, starRef.r),
    relPlanetSky,
    relMoonSky,
    vPlanetSky,
    vPlanetSkyRef,
    tdvRatio,
  };
}
