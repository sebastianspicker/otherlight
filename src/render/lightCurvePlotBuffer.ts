import { isFiniteNumber } from "../core/units";

import type { LightCurveHistoryState, LightCurveSample } from "./lightCurvePlotTypes";

export function createLightCurveHistoryState(capacity: number): LightCurveHistoryState {
  return {
    capacity: Math.max(10, Math.floor(isFiniteNumber(capacity) ? capacity : 2000)),
    flux: [],
    t: [],
    startIndex: 0,
    finiteTimeCount: 0,
    earliestFiniteTime: Number.NaN,
    earliestFiniteTimeIndex: -1,
    latestFiniteTime: Number.NaN,
    latestFiniteTimeIndex: -1,
  };
}

export function getActiveLength(state: LightCurveHistoryState): number {
  return state.flux.length - state.startIndex;
}

export function setLightCurveCapacity(state: LightCurveHistoryState, capacity: number): void {
  state.capacity = Math.max(10, Math.floor(isFiniteNumber(capacity) ? capacity : 2000));
  trimToCapacity(state);
}

export function pushLightCurveSample(state: LightCurveHistoryState, sample: LightCurveSample): void {
  if (!Number.isFinite(sample.flux)) return;

  state.flux.push(sample.flux);
  const nextTime = Number.isFinite(sample.t) ? (sample.t as number) : Number.NaN;
  state.t.push(nextTime);
  if (Number.isFinite(nextTime)) {
    state.finiteTimeCount++;
    if (state.finiteTimeCount === 1) {
      state.earliestFiniteTime = nextTime;
      state.earliestFiniteTimeIndex = state.t.length - 1;
    }
    state.latestFiniteTime = nextTime;
    state.latestFiniteTimeIndex = state.t.length - 1;
  }
  trimToCapacity(state);
}

export function clearLightCurveHistory(state: LightCurveHistoryState): void {
  state.flux = [];
  state.t = [];
  state.startIndex = 0;
  state.finiteTimeCount = 0;
  state.earliestFiniteTime = Number.NaN;
  state.earliestFiniteTimeIndex = -1;
  state.latestFiniteTime = Number.NaN;
  state.latestFiniteTimeIndex = -1;
}

export function resolveEarliestFiniteTime(state: LightCurveHistoryState, activeLength: number): number {
  if (state.earliestFiniteTimeIndex >= state.startIndex && Number.isFinite(state.earliestFiniteTime)) {
    return state.earliestFiniteTime;
  }

  for (let i = 0; i < activeLength; i++) {
    const index = state.startIndex + i;
    const tt = state.t[index];
    if (!Number.isFinite(tt)) continue;
    state.earliestFiniteTime = tt;
    state.earliestFiniteTimeIndex = index;
    return tt;
  }

  state.earliestFiniteTime = Number.NaN;
  state.earliestFiniteTimeIndex = -1;
  return Number.NaN;
}

export function resolveLatestFiniteTime(state: LightCurveHistoryState, activeLength: number): number {
  if (state.latestFiniteTimeIndex >= state.startIndex && Number.isFinite(state.latestFiniteTime)) {
    return state.latestFiniteTime;
  }

  for (let i = activeLength - 1; i >= 0; i--) {
    const index = state.startIndex + i;
    const tt = state.t[index];
    if (!Number.isFinite(tt)) continue;
    state.latestFiniteTime = tt;
    state.latestFiniteTimeIndex = index;
    return tt;
  }

  state.latestFiniteTime = Number.NaN;
  state.latestFiniteTimeIndex = -1;
  return Number.NaN;
}

function compactHistory(state: LightCurveHistoryState, force = false): void {
  if (state.startIndex <= 0) return;
  if (!force && state.startIndex < 1024 && state.startIndex * 2 < state.flux.length) return;

  if (state.earliestFiniteTimeIndex >= state.startIndex) {
    state.earliestFiniteTimeIndex -= state.startIndex;
  } else {
    state.earliestFiniteTimeIndex = -1;
    state.earliestFiniteTime = Number.NaN;
  }

  if (state.latestFiniteTimeIndex >= state.startIndex) {
    state.latestFiniteTimeIndex -= state.startIndex;
  } else {
    state.latestFiniteTimeIndex = -1;
    state.latestFiniteTime = Number.NaN;
  }

  state.flux = state.flux.slice(state.startIndex);
  state.t = state.t.slice(state.startIndex);
  state.startIndex = 0;
}

function trimToCapacity(state: LightCurveHistoryState): void {
  const overflow = getActiveLength(state) - state.capacity;
  if (overflow <= 0) return;

  const nextStartIndex = state.startIndex + overflow;
  let removedFiniteCount = 0;
  for (let i = state.startIndex; i < nextStartIndex; i++) {
    if (Number.isFinite(state.t[i])) removedFiniteCount++;
  }
  state.finiteTimeCount = Math.max(0, state.finiteTimeCount - removedFiniteCount);
  if (state.earliestFiniteTimeIndex < nextStartIndex) {
    state.earliestFiniteTimeIndex = -1;
    state.earliestFiniteTime = Number.NaN;
  }
  if (state.latestFiniteTimeIndex < nextStartIndex) {
    state.latestFiniteTimeIndex = -1;
    state.latestFiniteTime = Number.NaN;
  }
  state.startIndex = nextStartIndex;
  compactHistory(state);
}
