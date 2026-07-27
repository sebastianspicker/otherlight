/** Provides transit-sequence fixtures that preserve simulation timing contracts used by tests. */

import type { SystemParams } from "../../src/core/types";
import { projectToSky } from "../../src/physics/frames";
import { computeBodyKinematics } from "../../src/sim/kinematics";
import { resolveOrbitElements } from "../../src/sim/orbits";
import { getObserverDir } from "../../src/sim/observerContract";
import { sampleSystemState } from "../../src/sim/stateSampler";
import { estimateTransitEvent, type TransitEventEstimate } from "../../src/sim/transitTiming";

export type TransitBodyId = "planet" | "moon";

type TransitSequenceEvent = {
  epoch: number;
  predictedCenterSec: number;
  observedCenterSec?: number;
  ocSec?: number;
  durationSec?: number;
  ingressSec?: number;
  egressSec?: number;
};

export type TransitSequenceDiagnostics = {
  body: TransitBodyId;
  periodSec: number;
  referenceCenterSec: number;
  referenceEpoch: number;
  events: TransitSequenceEvent[];
  detectedCount: number;
  rmsOcSec?: number;
  maxAbsOcSec?: number;
};

function eventFromState(
  system: SystemParams,
  tObsSec: number,
  body: TransitBodyId,
): TransitEventEstimate | undefined {
  const observerDir = getObserverDir(system);
  const kin = computeBodyKinematics(system, tObsSec, observerDir);
  const sampled = sampleSystemState({
    system,
    tObs: tObsSec,
    observerDir,
    kinAtT: kin,
    velDtSec: system.dynamics?.exomoonTimingShape?.velDt,
  });

  if (body === "planet") {
    return estimateTransitEvent({
      tObsSec,
      rStar: system.star.r,
      rBody: system.planet.r,
      sky: kin.planetSky,
      vSky: projectToSky(sampled.planet.v, observerDir),
      sampleAt: (trialSec) => {
        const kinAtTrial = computeBodyKinematics(system, trialSec, observerDir);
        const sampledAtTrial = sampleSystemState({
          system,
          tObs: trialSec,
          observerDir,
          kinAtT: kinAtTrial,
          velDtSec: system.dynamics?.exomoonTimingShape?.velDt,
        });
        return {
          sky: kinAtTrial.planetSky,
          vSky: projectToSky(sampledAtTrial.planet.v, observerDir),
        };
      },
    });
  }

  if (!system.moon || !kin.moonSky || !sampled.moon) return undefined;
  return estimateTransitEvent({
    tObsSec,
    rStar: system.star.r,
    rBody: system.moon.r,
    sky: kin.moonSky,
    vSky: projectToSky(sampled.moon.v, observerDir),
    sampleAt: (trialSec) => {
      const kinAtTrial = computeBodyKinematics(system, trialSec, observerDir);
      const sampledAtTrial = sampleSystemState({
        system,
        tObs: trialSec,
        observerDir,
        kinAtT: kinAtTrial,
        velDtSec: system.dynamics?.exomoonTimingShape?.velDt,
      });
      if (!kinAtTrial.moonSky || !sampledAtTrial.moon) return undefined;
      return {
        sky: kinAtTrial.moonSky,
        vSky: projectToSky(sampledAtTrial.moon.v, observerDir),
      };
    },
  });
}

function assertTransitSequenceInputs(args: {
  system: SystemParams;
  body: TransitBodyId;
  aroundSec: number;
}): void {
  if (!(Number.isFinite(args.aroundSec) && Number.isFinite(args.system.star.r) && args.system.star.r > 0)) {
    throw new Error("buildTransitSequenceDiagnostics: invalid inputs.");
  }
  if (args.body === "moon" && !args.system.moon) {
    throw new Error("buildTransitSequenceDiagnostics: moon body requested but moon is missing.");
  }
}

function boundedEpochCount(value: number | undefined, fallback: number): number {
  return Math.max(0, Math.floor(value ?? fallback));
}

function transitSequenceOrbit(system: SystemParams, body: TransitBodyId, aroundSec: number) {
  return body === "planet"
    ? resolveOrbitElements(system.planet.orbit, aroundSec, "planet.orbit")
    : resolveOrbitElements(system.moon!.orbitAroundPlanet, aroundSec, "moon.orbitAroundPlanet");
}

function transitSequenceRow(
  system: SystemParams,
  body: TransitBodyId,
  epoch: number,
  predictedCenterSec: number,
): TransitSequenceEvent {
  const event = eventFromState(system, predictedCenterSec, body);
  if (!event) return { epoch, predictedCenterSec };
  return {
    epoch,
    predictedCenterSec,
    observedCenterSec: event.centerSec,
    ocSec: event.centerSec - predictedCenterSec,
    durationSec: event.durationSec,
    ingressSec: event.ingressSec,
    egressSec: event.egressSec,
  };
}

function transitSequenceEvents(args: {
  system: SystemParams;
  body: TransitBodyId;
  anchorEpoch: number;
  epochsBefore: number;
  epochsAfter: number;
  anchorCenter: number;
  periodSec: number;
}): TransitSequenceEvent[] {
  const events: TransitSequenceEvent[] = [];
  for (
    let epoch = args.anchorEpoch - args.epochsBefore;
    epoch <= args.anchorEpoch + args.epochsAfter;
    epoch++
  ) {
    const predictedCenterSec = args.anchorCenter + (epoch - args.anchorEpoch) * args.periodSec;
    events.push(transitSequenceRow(args.system, args.body, epoch, predictedCenterSec));
  }
  return events;
}

function transitSequenceStats(events: TransitSequenceEvent[]): {
  detectedCount: number;
  rmsOcSec?: number;
  maxAbsOcSec?: number;
} {
  const ocValues = events.map((e) => e.ocSec).filter((v): v is number => Number.isFinite(v));
  const detectedCount = ocValues.length;
  return {
    detectedCount,
    rmsOcSec:
      detectedCount > 0 ? Math.sqrt(ocValues.reduce((sum, v) => sum + v * v, 0) / detectedCount) : undefined,
    maxAbsOcSec: detectedCount > 0 ? ocValues.reduce((m, v) => Math.max(m, Math.abs(v)), 0) : undefined,
  };
}

export function buildTransitSequenceDiagnostics(args: {
  system: SystemParams;
  body?: TransitBodyId;
  aroundSec: number;
  epochsBefore?: number;
  epochsAfter?: number;
}): TransitSequenceDiagnostics {
  const body = args.body ?? "planet";
  const aroundSec = args.aroundSec;
  const epochsBefore = boundedEpochCount(args.epochsBefore, 2);
  const epochsAfter = boundedEpochCount(args.epochsAfter, 2);
  assertTransitSequenceInputs({ system: args.system, body, aroundSec });

  const orbit = transitSequenceOrbit(args.system, body, aroundSec);
  const periodSec = orbit.period;
  const anchor = eventFromState(args.system, aroundSec, body);
  const anchorCenter = anchor?.centerSec ?? aroundSec;
  const anchorEpoch = Math.round((anchorCenter - orbit.t0) / periodSec);
  const events = transitSequenceEvents({
    ...args,
    body,
    anchorEpoch,
    epochsBefore,
    epochsAfter,
    anchorCenter,
    periodSec,
  });
  const stats = transitSequenceStats(events);

  return {
    body,
    periodSec,
    referenceCenterSec: anchorCenter,
    referenceEpoch: anchorEpoch,
    events,
    ...stats,
  };
}
