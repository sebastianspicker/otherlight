import type { StepEventTimingSolveBundle, StepTimingDiagnostics, SystemParams } from "../core/types";
import { projectToSky } from "../physics/frames";
import type { Vec3 } from "../physics/vec3";
import { computeBodyKinematics, type BodyKinematics } from "./kinematics";
import { orbitTimingKey } from "./orbitTimingKey";
import { resolveOrbitElements } from "./orbits";
import { sampleSystemState } from "./stateSampler";
import {
  computeTransitReferenceEpochSec,
  estimateTransitEventWithDiagnostics,
  usesExactTransitTiming,
} from "./transitTimingSolve";

export type { TransitEventEstimate } from "./transitTimingSolve";
export {
  computeTransitReferenceEpochSec,
  estimateTransitEvent,
  estimateTransitEventWithDiagnostics,
} from "./transitTimingSolve";

const transitReferenceEpochCache = new WeakMap<SystemParams, Map<string, number | undefined>>();

type TransitTimingDiagnosticsResult = {
  timing?: StepTimingDiagnostics;
  eventTimingConvergence?: StepEventTimingSolveBundle;
};
type TransitTimingContext = {
  params: SystemParams;
  tObsSec: number;
  observerDir: Vec3;
  kin: BodyKinematics;
  useExactTiming: boolean;
  sampled: ReturnType<typeof sampleSystemState>;
};
type TransitEventSolve = ReturnType<typeof estimateTransitEventWithDiagnostics>;
type TransitSampleAt = NonNullable<Parameters<typeof estimateTransitEventWithDiagnostics>[0]["sampleAt"]>;
type SampledAtTrial = {
  kin: BodyKinematics;
  sampled: ReturnType<typeof sampleSystemState>;
};

function cachedTransitReferenceEpochSec(
  system: SystemParams,
  key: string,
  compute: () => number | undefined,
): number | undefined {
  let cache = transitReferenceEpochCache.get(system);
  if (!cache) {
    cache = new Map<string, number | undefined>();
    transitReferenceEpochCache.set(system, cache);
  }
  if (cache.has(key)) return cache.get(key);
  const value = compute();
  cache.set(key, value);
  return value;
}

// Cache the reference epoch per SystemParams object, but key by the orbit values
// that affect event timing. Preset and UI flows mutate by replacing params, while
// exact/scientific timing can change orbit orientation or fidelity flags without
// changing period/t0.
export function computeTransitTimingDiagnostics(
  params: SystemParams,
  tObsSec: number,
  observerDir: Vec3,
  kin: BodyKinematics,
): TransitTimingDiagnosticsResult {
  const context = transitTimingContext(params, tObsSec, observerDir, kin);
  const planetEvent = planetTransitEvent(context);
  const moonEvent = moonTransitEvent(context);

  return {
    timing: transitTimingDiagnostics(planetEvent, moonEvent),
    eventTimingConvergence: eventTimingConvergence(planetEvent, moonEvent),
  };
}

function transitTimingContext(
  params: SystemParams,
  tObsSec: number,
  observerDir: Vec3,
  kin: BodyKinematics,
): TransitTimingContext {
  return {
    params,
    tObsSec,
    observerDir,
    kin,
    useExactTiming: usesExactTransitTiming(params),
    sampled: sampleSystemState({
      system: params,
      tObs: tObsSec,
      observerDir,
      kinAtT: kin,
      velDtSec: params.dynamics?.exomoonTimingShape?.velDt,
    }),
  };
}

function sampledAtTrial(context: TransitTimingContext, trialSec: number): SampledAtTrial {
  const kinAtTrial = computeBodyKinematics(context.params, trialSec, context.observerDir);
  return {
    kin: kinAtTrial,
    sampled: sampleSystemState({
      system: context.params,
      tObs: trialSec,
      observerDir: context.observerDir,
      kinAtT: kinAtTrial,
      velDtSec: context.params.dynamics?.exomoonTimingShape?.velDt,
    }),
  };
}

function planetSampleAt(context: TransitTimingContext): TransitSampleAt | undefined {
  if (!context.useExactTiming) return undefined;

  return (trialSec: number) => {
    const trial = sampledAtTrial(context, trialSec);
    return {
      sky: trial.kin.planetSky,
      vSky: projectToSky(trial.sampled.planet.v, context.observerDir),
    };
  };
}

function moonSampleAt(context: TransitTimingContext): TransitSampleAt | undefined {
  if (!context.useExactTiming || !context.params.moon) return undefined;

  return (trialSec: number) => {
    const trial = sampledAtTrial(context, trialSec);
    if (!trial.kin.moonSky || !trial.sampled.moon) return undefined;
    return {
      sky: trial.kin.moonSky,
      vSky: projectToSky(trial.sampled.moon.v, context.observerDir),
    };
  };
}

function planetTransitEvent(context: TransitTimingContext): TransitEventSolve {
  const sampleAt = planetSampleAt(context);
  const planetVSky = projectToSky(context.sampled.planet.v, context.observerDir);
  const transitReferenceEpochSec = planetTransitReferenceEpochSec(context, sampleAt);

  return estimateTransitEventWithDiagnostics({
    tObsSec: context.tObsSec,
    rStar: context.params.star.r,
    rBody: context.params.planet.r,
    sky: context.kin.planetSky,
    vSky: planetVSky,
    periodSec: context.kin.planetOrbit.period,
    t0Sec: context.kin.planetOrbit.t0,
    transitReferenceEpochSec,
    sampleAt,
  });
}

function planetTransitReferenceEpochSec(
  context: TransitTimingContext,
  sampleAt: TransitSampleAt | undefined,
): number | undefined {
  const { params, kin } = context;
  return cachedTransitReferenceEpochSec(params, planetReferenceEpochKey(context), () =>
    computeTransitReferenceEpochSec({
      rStar: params.star.r,
      rBody: params.planet.r,
      periodSec: kin.planetOrbit.period,
      t0Sec: kin.planetOrbit.t0,
      sampleAt,
    }),
  );
}

function planetReferenceEpochKey(context: TransitTimingContext): string {
  const { params, kin, observerDir } = context;
  return [
    "planet",
    params.star.r,
    params.planet.r,
    orbitTimingKey("orbit", kin.planetOrbit),
    observerDir.x,
    observerDir.y,
    observerDir.z,
    params.dynamics?.fidelityProfile ?? "",
    params.dynamics?.relativityLevel ?? "",
    Boolean(params.dynamics?.nbodyPlanetMoon?.enabled),
  ].join(":");
}

function moonTransitEvent(context: TransitTimingContext): TransitEventSolve | undefined {
  const moonOrbit = moonOrbitAtObservation(context);
  const moonVSky = context.sampled.moon
    ? projectToSky(context.sampled.moon.v, context.observerDir)
    : undefined;
  const sampleAt = moonSampleAt(context);
  const transitReferenceEpochSec = moonTransitReferenceEpochSec(context, moonOrbit, sampleAt);
  if (!context.params.moon || !context.kin.moonSky || !moonVSky) return undefined;

  return estimateTransitEventWithDiagnostics({
    tObsSec: context.tObsSec,
    rStar: context.params.star.r,
    rBody: context.params.moon.r,
    sky: context.kin.moonSky,
    vSky: moonVSky,
    periodSec: moonOrbit?.period,
    t0Sec: moonOrbit?.t0,
    transitReferenceEpochSec,
    sampleAt,
  });
}

function moonOrbitAtObservation(context: TransitTimingContext) {
  return context.params.moon
    ? resolveOrbitElements(context.params.moon.orbitAroundPlanet, context.tObsSec, "moon.orbitAroundPlanet")
    : undefined;
}

function moonTransitReferenceEpochSec(
  context: TransitTimingContext,
  moonOrbit: ReturnType<typeof moonOrbitAtObservation>,
  sampleAt: TransitSampleAt | undefined,
): number | undefined {
  const { params } = context;
  return cachedTransitReferenceEpochSec(params, moonReferenceEpochKey(context, moonOrbit), () =>
    computeTransitReferenceEpochSec({
      rStar: params.star.r,
      rBody: params.moon?.r ?? Number.NaN,
      periodSec: moonOrbit?.period,
      t0Sec: moonOrbit?.t0,
      sampleAt,
    }),
  );
}

function moonReferenceEpochKey(
  context: TransitTimingContext,
  moonOrbit: ReturnType<typeof moonOrbitAtObservation>,
): string {
  const { params, kin, observerDir } = context;
  return [
    "moon",
    params.star.r,
    params.moon?.r ?? Number.NaN,
    orbitTimingKey("planet-orbit", kin.planetOrbit),
    orbitTimingKey("moon-orbit", moonOrbit),
    observerDir.x,
    observerDir.y,
    observerDir.z,
    params.dynamics?.fidelityProfile ?? "",
    params.dynamics?.relativityLevel ?? "",
    Boolean(params.dynamics?.nbodyPlanetMoon?.enabled),
  ].join(":");
}

function transitTimingDiagnostics(
  planetEvent: TransitEventSolve,
  moonEvent: TransitEventSolve | undefined,
): StepTimingDiagnostics | undefined {
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

  return hasFiniteTimingValue(timing) ? timing : undefined;
}

function hasFiniteTimingValue(timing: StepTimingDiagnostics): boolean {
  return Object.values(timing).some((value) => typeof value === "number" && Number.isFinite(value));
}

function eventTimingConvergence(
  planetEvent: TransitEventSolve,
  moonEvent: TransitEventSolve | undefined,
): StepEventTimingSolveBundle {
  return {
    planet: planetEvent.diagnostics,
    moon: moonEvent?.diagnostics,
  };
}
