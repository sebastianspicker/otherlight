import type { SystemParams } from "../core/types";
import { projectToSky } from "../physics/frames";
import { computeBodyKinematics } from "./kinematics";
import { resolveOrbitElements } from "./orbits";
import { getObserverDir } from "./observerContract";
import { sampleSystemState } from "./stateSampler";
import { estimateTransitEvent, type TransitEventEstimate } from "./transitTiming";

export type TransitBodyId = "planet" | "moon";

export type TransitSequenceEvent = {
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
    });
  }

  if (!system.moon || !kin.moonSky || !sampled.moon) return undefined;
  return estimateTransitEvent({
    tObsSec,
    rStar: system.star.r,
    rBody: system.moon.r,
    sky: kin.moonSky,
    vSky: projectToSky(sampled.moon.v, observerDir),
  });
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
  const epochsBefore = Math.max(0, Math.floor(args.epochsBefore ?? 2));
  const epochsAfter = Math.max(0, Math.floor(args.epochsAfter ?? 2));

  if (!(Number.isFinite(aroundSec) && Number.isFinite(args.system.star.r) && args.system.star.r > 0)) {
    throw new Error("buildTransitSequenceDiagnostics: invalid inputs.");
  }
  if (body === "moon" && !args.system.moon) {
    throw new Error("buildTransitSequenceDiagnostics: moon body requested but moon is missing.");
  }

  const orbit =
    body === "planet"
      ? resolveOrbitElements(args.system.planet.orbit, aroundSec, "planet.orbit")
      : resolveOrbitElements(args.system.moon!.orbitAroundPlanet, aroundSec, "moon.orbitAroundPlanet");

  const periodSec = orbit.period;
  const anchor = eventFromState(args.system, aroundSec, body);
  const anchorCenter = anchor?.centerSec ?? aroundSec;
  const anchorEpoch = Math.round((anchorCenter - orbit.t0) / periodSec);

  const events: TransitSequenceEvent[] = [];
  for (let epoch = anchorEpoch - epochsBefore; epoch <= anchorEpoch + epochsAfter; epoch++) {
    const predictedCenterSec = anchorCenter + (epoch - anchorEpoch) * periodSec;
    const event = eventFromState(args.system, predictedCenterSec, body);

    const row: TransitSequenceEvent = { epoch, predictedCenterSec };
    if (event) {
      row.observedCenterSec = event.centerSec;
      row.ocSec = event.centerSec - predictedCenterSec;
      row.durationSec = event.durationSec;
      row.ingressSec = event.ingressSec;
      row.egressSec = event.egressSec;
    }
    events.push(row);
  }

  const ocValues = events.map((e) => e.ocSec).filter((v): v is number => Number.isFinite(v));
  const detectedCount = ocValues.length;
  const rmsOcSec =
    detectedCount > 0 ? Math.sqrt(ocValues.reduce((sum, v) => sum + v * v, 0) / detectedCount) : undefined;
  const maxAbsOcSec = detectedCount > 0 ? ocValues.reduce((m, v) => Math.max(m, Math.abs(v)), 0) : undefined;

  return {
    body,
    periodSec,
    referenceCenterSec: anchorCenter,
    referenceEpoch: anchorEpoch,
    events,
    detectedCount,
    rmsOcSec,
    maxAbsOcSec,
  };
}
