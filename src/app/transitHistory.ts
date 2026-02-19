import type { SystemParams } from "../core/types";
import type { SimulationStepV3 } from "../sim/v3";
import { resolveOrbitElements } from "../sim/orbits";

export type TransitHistoryEvent = {
  centerSec: number;
  ocSec?: number;
  durationSec?: number;
  ingressSec?: number;
  egressSec?: number;
  detectedAtSec: number;
};

export type TransitHistorySeries = {
  events: TransitHistoryEvent[];
  latestOcSec?: number;
  rmsOcSec?: number;
};

export type TransitHistoryState = {
  maxEvents: number;
  planet: TransitHistorySeries;
  moon: TransitHistorySeries;
};

function emptySeries(): TransitHistorySeries {
  return { events: [] };
}

function finiteOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function getBodyPeriodSec(system: SystemParams, body: "planet" | "moon", tSec: number): number | undefined {
  try {
    const orbit =
      body === "planet"
        ? resolveOrbitElements(system.planet.orbit, tSec, "planet.orbit")
        : system.moon
          ? resolveOrbitElements(system.moon.orbitAroundPlanet, tSec, "moon.orbitAroundPlanet")
          : undefined;
    return orbit && Number.isFinite(orbit.period) && orbit.period > 0 ? orbit.period : undefined;
  } catch {
    return undefined;
  }
}

function dedupeWindowSec(periodSec?: number): number {
  if (Number.isFinite(periodSec) && (periodSec as number) > 0) {
    return Math.max(0.5, Math.min((periodSec as number) * 0.2, 1200));
  }
  return 30;
}

function recomputeOcStats(series: TransitHistorySeries): void {
  const oc = series.events.map((e) => e.ocSec).filter((v): v is number => Number.isFinite(v));
  series.latestOcSec = oc.length > 0 ? oc[oc.length - 1] : undefined;
  series.rmsOcSec = oc.length > 0 ? Math.sqrt(oc.reduce((sum, v) => sum + v * v, 0) / oc.length) : undefined;
}

function appendOrUpdateEvent(args: {
  series: TransitHistorySeries;
  maxEvents: number;
  tNowSec: number;
  periodSec?: number;
  centerSec?: number;
  ocSec?: number;
  durationSec?: number;
  ingressSec?: number;
  egressSec?: number;
}): boolean {
  const centerSec = finiteOrUndefined(args.centerSec);
  if (centerSec === undefined) return false;
  if (centerSec > args.tNowSec + 1e-9) return false;

  const window = dedupeWindowSec(args.periodSec);
  const idx = args.series.events.findIndex((e) => Math.abs(e.centerSec - centerSec) <= window);
  const row: TransitHistoryEvent = {
    centerSec,
    ocSec: finiteOrUndefined(args.ocSec),
    durationSec: finiteOrUndefined(args.durationSec),
    ingressSec: finiteOrUndefined(args.ingressSec),
    egressSec: finiteOrUndefined(args.egressSec),
    detectedAtSec: args.tNowSec,
  };

  if (idx >= 0) {
    args.series.events[idx] = row;
    recomputeOcStats(args.series);
    return false;
  }

  args.series.events.push(row);
  args.series.events.sort((a, b) => a.centerSec - b.centerSec);
  if (args.series.events.length > args.maxEvents) {
    args.series.events.splice(0, args.series.events.length - args.maxEvents);
  }
  recomputeOcStats(args.series);
  return true;
}

export function createTransitHistoryState(maxEvents = 128): TransitHistoryState {
  return {
    maxEvents: Math.max(4, Math.floor(Number.isFinite(maxEvents) ? maxEvents : 128)),
    planet: emptySeries(),
    moon: emptySeries(),
  };
}

export function resetTransitHistoryState(state: TransitHistoryState): TransitHistoryState {
  return createTransitHistoryState(state.maxEvents);
}

export function updateTransitHistoryFromStep(args: {
  state: TransitHistoryState;
  step: SimulationStepV3;
  system: SystemParams;
  tNowSec: number;
}): boolean {
  const { state, step, system, tNowSec } = args;
  const timing = step.timing;
  if (!timing) return false;

  let changed = false;
  changed =
    appendOrUpdateEvent({
      series: state.planet,
      maxEvents: state.maxEvents,
      tNowSec,
      periodSec: getBodyPeriodSec(system, "planet", tNowSec),
      centerSec: timing.planetTransitCenterSec,
      ocSec: timing.planetTtvSec,
      durationSec: timing.planetTransitDurationSec,
      ingressSec: timing.planetIngressSec,
      egressSec: timing.planetEgressSec,
    }) || changed;

  changed =
    appendOrUpdateEvent({
      series: state.moon,
      maxEvents: state.maxEvents,
      tNowSec,
      periodSec: getBodyPeriodSec(system, "moon", tNowSec),
      centerSec: timing.moonTransitCenterSec,
      ocSec: timing.moonTtvSec,
      durationSec: timing.moonTransitDurationSec,
      ingressSec: timing.moonIngressSec,
      egressSec: timing.moonEgressSec,
    }) || changed;

  return changed;
}

function fmt(v: number | undefined, digits = 3): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toExponential(digits) : "n/a";
}

export function formatTransitHistorySummary(state: TransitHistoryState): string {
  const pN = state.planet.events.length;
  const mN = state.moon.events.length;
  if (pN === 0 && mN === 0) return "transit events: none";

  const pLastDur =
    state.planet.events.length > 0
      ? state.planet.events[state.planet.events.length - 1].durationSec
      : undefined;
  const mLastDur =
    state.moon.events.length > 0 ? state.moon.events[state.moon.events.length - 1].durationSec : undefined;
  const p = `planet n=${pN} oc=${fmt(state.planet.latestOcSec)} rms=${fmt(state.planet.rmsOcSec)} dur=${fmt(pLastDur)}`;
  const m = `moon n=${mN} oc=${fmt(state.moon.latestOcSec)} rms=${fmt(state.moon.rmsOcSec)} dur=${fmt(mLastDur)}`;
  return mN > 0 ? `${p} | ${m}` : p;
}
