import type { SkyPoint, StepTimingDiagnostics, SystemParams } from "../core/types";
import { projectToSky } from "../physics/frames";
import type { Vec3 } from "../physics/vec3";
import type { BodyKinematics } from "./kinematics";
import { resolveOrbitElements } from "./orbits";
import { sampleSystemState } from "./stateSampler";

export type TransitEventEstimate = {
  centerSec: number;
  durationSec: number;
  ingressSec: number;
  egressSec: number;
  ttvSec?: number;
};

export function estimateTransitEvent(args: {
  tObsSec: number;
  rStar: number;
  rBody: number;
  sky: SkyPoint;
  vSky: SkyPoint;
  periodSec?: number;
  t0Sec?: number;
}): TransitEventEstimate | undefined {
  const { tObsSec, rStar, rBody, sky, vSky, periodSec, t0Sec } = args;
  if (!(Number.isFinite(rStar) && rStar > 0)) return undefined;
  if (!(Number.isFinite(rBody) && rBody > 0)) return undefined;
  if (!Number.isFinite(sky.x) || !Number.isFinite(sky.y) || !Number.isFinite(sky.z)) return undefined;
  if (!Number.isFinite(vSky.x) || !Number.isFinite(vSky.y) || !Number.isFinite(vSky.z)) return undefined;

  const speed2 = vSky.x * vSky.x + vSky.y * vSky.y;
  if (!(speed2 > 0)) return undefined;

  const dtCenter = -((sky.x * vSky.x + sky.y * vSky.y) / speed2);
  const xCenter = sky.x + vSky.x * dtCenter;
  const yCenter = sky.y + vSky.y * dtCenter;
  const zCenter = sky.z + vSky.z * dtCenter;
  const impactMin = Math.hypot(xCenter, yCenter);
  const rSum = rStar + rBody;

  if (!(impactMin < rSum)) return undefined;
  if (!(zCenter > 0)) return undefined;

  const chord = Math.sqrt(Math.max(0, rSum * rSum - impactMin * impactMin)) * 2;
  const speed = Math.sqrt(speed2);
  if (!(speed > 0)) return undefined;
  const durationSec = chord / speed;

  const centerSec = tObsSec + dtCenter;
  const ingressSec = centerSec - durationSec / 2;
  const egressSec = centerSec + durationSec / 2;

  let ttvSec: number | undefined;
  if (Number.isFinite(periodSec) && (periodSec as number) > 0 && Number.isFinite(t0Sec)) {
    const k = Math.round((centerSec - (t0Sec as number)) / (periodSec as number));
    const centerEphem = (t0Sec as number) + k * (periodSec as number);
    if (Number.isFinite(centerEphem)) ttvSec = centerSec - centerEphem;
  }

  return { centerSec, durationSec, ingressSec, egressSec, ttvSec };
}

export function computeTransitTimingDiagnostics(
  params: SystemParams,
  tObsSec: number,
  observerDir: Vec3,
  kin: BodyKinematics,
): StepTimingDiagnostics {
  const sampled = sampleSystemState({
    system: params,
    tObs: tObsSec,
    observerDir,
    kinAtT: kin,
    velDtSec: params.dynamics?.exomoonTimingShape?.velDt,
  });

  const planetVSky = projectToSky(sampled.planet.v, observerDir);
  const planetEvent = estimateTransitEvent({
    tObsSec,
    rStar: params.star.r,
    rBody: params.planet.r,
    sky: kin.planetSky,
    vSky: planetVSky,
    periodSec: kin.planetOrbit.period,
    t0Sec: kin.planetOrbit.t0,
  });

  const moonOrbit = params.moon
    ? resolveOrbitElements(params.moon.orbitAroundPlanet, tObsSec, "moon.orbitAroundPlanet")
    : undefined;
  const moonVSky = sampled.moon ? projectToSky(sampled.moon.v, observerDir) : undefined;
  const moonEvent =
    params.moon && kin.moonSky && moonVSky
      ? estimateTransitEvent({
          tObsSec,
          rStar: params.star.r,
          rBody: params.moon.r,
          sky: kin.moonSky,
          vSky: moonVSky,
          periodSec: moonOrbit?.period,
          t0Sec: moonOrbit?.t0,
        })
      : undefined;

  return {
    planetTransitCenterSec: planetEvent?.centerSec,
    planetTransitDurationSec: planetEvent?.durationSec,
    planetIngressSec: planetEvent?.ingressSec,
    planetEgressSec: planetEvent?.egressSec,
    planetTtvSec: planetEvent?.ttvSec,
    moonTransitCenterSec: moonEvent?.centerSec,
    moonTransitDurationSec: moonEvent?.durationSec,
    moonIngressSec: moonEvent?.ingressSec,
    moonEgressSec: moonEvent?.egressSec,
    moonTtvSec: moonEvent?.ttvSec,
  };
}
