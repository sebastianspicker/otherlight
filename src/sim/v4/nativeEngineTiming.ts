import type {
  OrbitElements,
  StepEventTimingSolveBundle,
  StepObservables,
  StepTimingDiagnostics,
} from "../../core/types";
import { impactParameterFromProjectedSky } from "../../physics/exomoonTiming";
import { projectToSky } from "../../physics/frames";
import type { Vec3 } from "../../physics/vec3";
import { vIsFinite, vLenSq, vNormalizeOrZero, vSub } from "../../physics/vec3";
import { estimateTransitEventWithDiagnostics } from "../transitTiming";
import type { MoonBodyV4, PlanetBodyV4, SimulationConfigV4 } from "./types";
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

export function computeTimingAndObservables(
  config: SimulationConfigV4,
  snap: NativeSnapshot,
  tObsSec: number,
): {
  timing?: StepTimingDiagnostics;
  eventTimingConvergence?: StepEventTimingSolveBundle;
  observables?: StepObservables;
  bPlanet?: number;
  bMoon?: number;
  relPlanetSky: { x: number; y: number; z: number };
  relMoonSky?: { x: number; y: number; z: number };
  vPlanetSky?: number;
  vPlanetSkyRef?: number;
  tdvRatio?: number;
} {
  const starRef = snap.stars[0];
  const planet = snap.planets[0] ?? snap.stars[1];
  const moon = snap.moons[0];
  const obs = snap.observerDir;
  const useExactTiming = config.runtime?.executionMode === "scientific-browser";

  const rv = (v: Vec3): number => {
    const d = vNormalizeOrZero(obs);
    if (!vIsFinite(v) || vLenSq(d) <= 0) return 0;
    return -(v.x * d.x + v.y * d.y + v.z * d.z);
  };

  const relPlanetSky = {
    x: planet.sky.x - starRef.sky.x,
    y: planet.sky.y - starRef.sky.y,
    z: planet.sky.z - starRef.sky.z,
  };
  const planetVSky = projectToSky(vSub(planet.vAbs, starRef.vAbs), obs);
  const pEvent = estimateTransitEventWithDiagnostics({
    tObsSec,
    rStar: starRef.r,
    rBody: planet.r,
    sky: relPlanetSky,
    vSky: planetVSky,
    periodSec:
      sourceOrbit(planet)?.period ??
      (planet.id === snap.stars[1]?.id ? config.orbits.binary.period : undefined),
    t0Sec: sourceOrbit(planet)?.t0 ?? (planet.id === snap.stars[1]?.id ? config.orbits.binary.t0 : undefined),
    sampleAt: useExactTiming
      ? (trialSec) => {
          const trialSnap = buildNativeSnapshot(config, trialSec);
          const trialStar = trialSnap.stars[0];
          const trialPlanet = trialSnap.planets[0] ?? trialSnap.stars[1];
          if (!trialStar || !trialPlanet) return undefined;
          return {
            sky: {
              x: trialPlanet.sky.x - trialStar.sky.x,
              y: trialPlanet.sky.y - trialStar.sky.y,
              z: trialPlanet.sky.z - trialStar.sky.z,
            },
            vSky: projectToSky(vSub(trialPlanet.vAbs, trialStar.vAbs), obs),
          };
        }
      : undefined,
  });

  let mEvent: ReturnType<typeof estimateTransitEventWithDiagnostics> | undefined;
  let relMoonSky: { x: number; y: number; z: number } | undefined;
  let moonVSky: { x: number; y: number; z: number } | undefined;
  if (moon) {
    relMoonSky = {
      x: moon.sky.x - starRef.sky.x,
      y: moon.sky.y - starRef.sky.y,
      z: moon.sky.z - starRef.sky.z,
    };
    moonVSky = projectToSky(vSub(moon.vAbs, starRef.vAbs), obs);
    mEvent = estimateTransitEventWithDiagnostics({
      tObsSec,
      rStar: starRef.r,
      rBody: moon.r,
      sky: relMoonSky,
      vSky: moonVSky,
      periodSec: sourceOrbit(moon)?.period,
      t0Sec: sourceOrbit(moon)?.t0,
      sampleAt: useExactTiming
        ? (trialSec) => {
            const trialSnap = buildNativeSnapshot(config, trialSec);
            const trialStar = trialSnap.stars[0];
            const trialMoon = trialSnap.moons[0];
            if (!trialStar || !trialMoon) return undefined;
            return {
              sky: {
                x: trialMoon.sky.x - trialStar.sky.x,
                y: trialMoon.sky.y - trialStar.sky.y,
                z: trialMoon.sky.z - trialStar.sky.z,
              },
              vSky: projectToSky(vSub(trialMoon.vAbs, trialStar.vAbs), obs),
            };
          }
        : undefined,
    });
  }

  const timing: StepTimingDiagnostics | undefined =
    pEvent.event || mEvent?.event
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
  const eventTimingConvergence: StepEventTimingSolveBundle = {
    planet: pEvent.diagnostics,
    moon: mEvent?.diagnostics,
  };

  const vPlanetSky = Math.hypot(planetVSky.x, planetVSky.y);
  const rawTRef = config.dynamics?.exomoonTimingShape?.tRef;
  const tRef =
    config.runtime?.executionMode === "scientific-browser"
      ? typeof rawTRef === "number" && Number.isFinite(rawTRef)
        ? rawTRef
        : undefined
      : finiteOrDefault(rawTRef, 0);
  const pRelRef =
    tRef !== undefined
      ? orbitStateAt(
          planet.id === snap.stars[1]?.id
            ? config.orbits.binary
            : (sourceOrbit(planet) ?? config.orbits.binary),
          tRef,
        )
      : undefined;
  const vPlanetSkyRef =
    pRelRef !== undefined
      ? Math.hypot(projectToSky(pRelRef.v, obs).x, projectToSky(pRelRef.v, obs).y)
      : undefined;
  const tdvRatio = vPlanetSky > 0 && vPlanetSkyRef !== undefined ? vPlanetSkyRef / vPlanetSky : undefined;
  const bPlanetRaw = impactParameterFromProjectedSky(relPlanetSky, starRef.r);
  const bPlanet = Number.isFinite(bPlanetRaw) ? bPlanetRaw : undefined;
  const bMoonRaw = relMoonSky ? impactParameterFromProjectedSky(relMoonSky, starRef.r) : Number.NaN;
  const bMoon = Number.isFinite(bMoonRaw) ? bMoonRaw : undefined;

  const observables: StepObservables = {
    rvStar: rv(starRef.vAbs),
    rvPlanet: rv(planet.vAbs),
    rvMoon: moon ? rv(moon.vAbs) : undefined,
    astrometricOffsetStar: { x: starRef.sky.x, y: starRef.sky.y },
    timing,
  };

  return {
    timing,
    observables,
    eventTimingConvergence,
    bPlanet,
    bMoon,
    relPlanetSky,
    relMoonSky,
    vPlanetSky,
    vPlanetSkyRef,
    tdvRatio,
  };
}
