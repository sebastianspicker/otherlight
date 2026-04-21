import type { VisibleTimeDomain, VisibleWindow } from "./lightCurvePlotMath";
import type { LightCurveHistoryState, ResolvedLightCurvePlotOptions } from "./lightCurvePlotTypes";
import { getActiveLength, resolveEarliestFiniteTime, resolveLatestFiniteTime } from "./lightCurvePlotBuffer";

function getFullVisibleTimeDomainInfo(
  state: LightCurveHistoryState,
  opts: ResolvedLightCurvePlotOptions,
  activeLength: number,
): VisibleTimeDomain | null {
  if (opts.xMode !== "time") return null;
  if (state.finiteTimeCount <= 0) return null;

  const tMin = resolveEarliestFiniteTime(state, activeLength);
  const latestFiniteTime = resolveLatestFiniteTime(state, activeLength);
  if (!Number.isFinite(tMin) || !Number.isFinite(latestFiniteTime)) return null;

  return {
    tMin,
    tMax: latestFiniteTime > tMin ? latestFiniteTime : tMin + 1,
    allFinite: state.finiteTimeCount === activeLength,
  };
}

function scanVisibleTimeDomain(
  state: LightCurveHistoryState,
  opts: ResolvedLightCurvePlotOptions,
  start: number,
  end: number,
): VisibleTimeDomain | null {
  if (opts.xMode !== "time") return null;

  let finiteCount = 0;
  let tMin = Number.POSITIVE_INFINITY;
  let tMax = Number.NEGATIVE_INFINITY;
  for (let i = start; i < end; i++) {
    const tt = state.t[state.startIndex + i];
    if (!Number.isFinite(tt)) continue;
    finiteCount++;
    if (tt < tMin) tMin = tt;
    if (tt > tMax) tMax = tt;
  }
  if (finiteCount === 0) return null;
  if (!(tMax > tMin)) tMax = tMin + 1;

  return { tMin, tMax, allFinite: finiteCount === end - start };
}

export function getVisibleWindowInfo(
  state: LightCurveHistoryState,
  opts: ResolvedLightCurvePlotOptions,
): VisibleWindow {
  const n = getActiveLength(state);
  if (n <= 1 || opts.trackingMode !== "live") {
    return {
      start: 0,
      end: n,
      timeDomain: n > 0 ? getFullVisibleTimeDomainInfo(state, opts, n) : null,
    };
  }

  const fallbackWindow = Math.max(2, Math.min(n, Math.floor(opts.dynamicWindowSamples)));
  const fallbackStart = Math.max(0, n - fallbackWindow);
  if (opts.xMode !== "time" || state.t.length - state.startIndex !== n) {
    return { start: fallbackStart, end: n, timeDomain: null };
  }

  const lastFiniteT = resolveLatestFiniteTime(state, n);
  if (!Number.isFinite(lastFiniteT)) {
    return {
      start: fallbackStart,
      end: n,
      timeDomain: scanVisibleTimeDomain(state, opts, fallbackStart, n),
    };
  }

  const latestFiniteOffset = state.latestFiniteTimeIndex - state.startIndex;
  if (latestFiniteOffset !== n - 1) {
    return {
      start: fallbackStart,
      end: n,
      timeDomain: scanVisibleTimeDomain(state, opts, fallbackStart, n),
    };
  }

  const windowSec = Math.max(1e-6, opts.dynamicWindowSec);
  const minT = lastFiniteT - windowSec;
  let start = n - 1;
  let tMin = lastFiniteT;
  while (start > 0) {
    const tt = state.t[state.startIndex + start - 1];
    if (!Number.isFinite(tt) || tt < minT) break;
    start--;
    tMin = tt;
  }

  if (n - start < 2) {
    return {
      start: fallbackStart,
      end: n,
      timeDomain: scanVisibleTimeDomain(state, opts, fallbackStart, n),
    };
  }

  return {
    start,
    end: n,
    timeDomain: {
      tMin,
      tMax: lastFiniteT > tMin ? lastFiniteT : tMin + 1,
      allFinite: true,
    },
  };
}

export function getVisibleSampleBounds(
  state: LightCurveHistoryState,
  opts: ResolvedLightCurvePlotOptions,
): { start: number; end: number } {
  const { start, end } = getVisibleWindowInfo(state, opts);
  return { start, end };
}

export function getVisibleTimeDomainInfo(
  state: LightCurveHistoryState,
  opts: ResolvedLightCurvePlotOptions,
  start: number,
  end: number,
): VisibleTimeDomain | null {
  const activeLength = getActiveLength(state);
  if (opts.xMode !== "time" || activeLength < end) return null;

  if (start === 0 && end === activeLength) {
    return getFullVisibleTimeDomainInfo(state, opts, activeLength);
  }

  const visibleWindow = getVisibleWindowInfo(state, opts);
  if (visibleWindow.start === start && visibleWindow.end === end) {
    return visibleWindow.timeDomain;
  }

  return scanVisibleTimeDomain(state, opts, start, end);
}

export function getVisibleTimeDomain(
  state: LightCurveHistoryState,
  opts: ResolvedLightCurvePlotOptions,
  start: number,
  end: number,
): { tMin: number; tMax: number } | null {
  const domain = getVisibleTimeDomainInfo(state, opts, start, end);
  return domain ? { tMin: domain.tMin, tMax: domain.tMax } : null;
}
