import type { VisibleTimeDomain, VisibleWindow } from "./lightCurvePlotMath";
import type { LightCurveHistoryState, ResolvedLightCurvePlotOptions } from "./lightCurvePlotTypes";
import { getFullVisibleTimeDomainInfo, scanVisibleTimeDomain } from "./lightCurvePlotTimeDomain";

export function fullVisibleWindow(
  state: LightCurveHistoryState,
  opts: ResolvedLightCurvePlotOptions,
  n: number,
): VisibleWindow {
  return {
    start: 0,
    end: n,
    timeDomain: n > 0 ? getFullVisibleTimeDomainInfo(state, opts, n) : null,
  };
}

export function fallbackWindowStart(n: number, opts: ResolvedLightCurvePlotOptions): number {
  const fallbackWindow = Math.max(2, Math.min(n, Math.floor(opts.dynamicWindowSamples)));
  return Math.max(0, n - fallbackWindow);
}

export function canUseLiveTimeWindow(
  state: LightCurveHistoryState,
  opts: ResolvedLightCurvePlotOptions,
  n: number,
): boolean {
  return opts.xMode === "time" && state.t.length - state.startIndex === n;
}

export function fallbackVisibleWindow(
  start: number,
  end: number,
  timeDomain: VisibleTimeDomain | null,
): VisibleWindow {
  return { start, end, timeDomain };
}

export function fallbackScannedWindow(
  state: LightCurveHistoryState,
  opts: ResolvedLightCurvePlotOptions,
  fallbackStart: number,
  n: number,
): VisibleWindow {
  return fallbackVisibleWindow(fallbackStart, n, scanVisibleTimeDomain(state, opts, fallbackStart, n));
}

export function liveTimeWindow(
  state: LightCurveHistoryState,
  opts: ResolvedLightCurvePlotOptions,
  n: number,
  fallbackStart: number,
  lastFiniteT: number,
): VisibleWindow {
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
    return fallbackScannedWindow(state, opts, fallbackStart, n);
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
