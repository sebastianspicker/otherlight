import type { StepEventTimingSolveBundle, StepTimingDiagnostics, SystemParams } from "../core/types";
import { projectToSky } from "../physics/frames";
import type { Vec3 } from "../physics/vec3";
import { computeBodyKinematics, type BodyKinematics } from "./kinematics";
import { resolveOrbitElements } from "./orbits";
import { sampleSystemState } from "./stateSampler";
import { estimateTransitEventWithDiagnostics, usesExactTransitTiming } from "./transitTimingSolve";

export type { TransitEventEstimate } from "./transitTimingSolve";
export { estimateTransitEvent, estimateTransitEventWithDiagnostics } from "./transitTimingSolve";

export function computeTransitTimingDiagnostics(
  params: SystemParams,
  tObsSec: number,
  observerDir: Vec3,
  kin: BodyKinematics,
): { timing?: StepTimingDiagnostics; eventTimingConvergence?: StepEventTimingSolveBundle } {
  const useExactTiming = usesExactTransitTiming(params);
  const sampled = sampleSystemState({
    system: params,
    tObs: tObsSec,
    observerDir,
    kinAtT: kin,
    velDtSec: params.dynamics?.exomoonTimingShape?.velDt,
  });

  const planetVSky = projectToSky(sampled.planet.v, observerDir);
  const planetEvent = estimateTransitEventWithDiagnostics({
    tObsSec,
    rStar: params.star.r,
    rBody: params.planet.r,
    sky: kin.planetSky,
    vSky: planetVSky,
    periodSec: kin.planetOrbit.period,
    t0Sec: kin.planetOrbit.t0,
    sampleAt: useExactTiming
      ? (trialSec) => {
          const kinAtTrial = computeBodyKinematics(params, trialSec, observerDir);
          const sampledAtTrial = sampleSystemState({
            system: params,
            tObs: trialSec,
            observerDir,
            kinAtT: kinAtTrial,
            velDtSec: params.dynamics?.exomoonTimingShape?.velDt,
          });
          return {
            sky: kinAtTrial.planetSky,
            vSky: projectToSky(sampledAtTrial.planet.v, observerDir),
          };
        }
      : undefined,
  });

  const moonOrbit = params.moon
    ? resolveOrbitElements(params.moon.orbitAroundPlanet, tObsSec, "moon.orbitAroundPlanet")
    : undefined;
  const moonVSky = sampled.moon ? projectToSky(sampled.moon.v, observerDir) : undefined;
  const moonEvent =
    params.moon && kin.moonSky && moonVSky
      ? estimateTransitEventWithDiagnostics({
          tObsSec,
          rStar: params.star.r,
          rBody: params.moon.r,
          sky: kin.moonSky,
          vSky: moonVSky,
          periodSec: moonOrbit?.period,
          t0Sec: moonOrbit?.t0,
          sampleAt: useExactTiming
            ? (trialSec) => {
                const kinAtTrial = computeBodyKinematics(params, trialSec, observerDir);
                const sampledAtTrial = sampleSystemState({
                  system: params,
                  tObs: trialSec,
                  observerDir,
                  kinAtT: kinAtTrial,
                  velDtSec: params.dynamics?.exomoonTimingShape?.velDt,
                });
                if (!kinAtTrial.moonSky || !sampledAtTrial.moon) return undefined;
                return {
                  sky: kinAtTrial.moonSky,
                  vSky: projectToSky(sampledAtTrial.moon.v, observerDir),
                };
              }
            : undefined,
        })
      : undefined;

  const timing: StepTimingDiagnostics = {
    planetTransitCenterSec: planetEvent.event?.centerSec,
    planetTransitDurationSec: planetEvent.event?.durationSec,
    planetIngressSec: planetEvent.event?.ingressSec,
    planetEgressSec: planetEvent.event?.egressSec,
    planetTtvSec: planetEvent.event?.ttvSec,
    moonTransitCenterSec: moonEvent?.event?.centerSec,
    moonTransitDurationSec: moonEvent?.event?.durationSec,
    moonIngressSec: moonEvent?.event?.ingressSec,
    moonEgressSec: moonEvent?.event?.egressSec,
    moonTtvSec: moonEvent?.event?.ttvSec,
  };
  const eventTimingConvergence: StepEventTimingSolveBundle = {
    planet: planetEvent.diagnostics,
    moon: moonEvent?.diagnostics,
  };
  return {
    timing: Object.values(timing).some((v) => typeof v === "number" && Number.isFinite(v))
      ? timing
      : undefined,
    eventTimingConvergence,
  };
}
