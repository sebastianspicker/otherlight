/**
 * Owns light Curve Plot Viewport support within the render layer. Keeps visual projection and drawing concerns out of simulation state.
 */
import type { VisibleTimeDomain, VisibleWindow } from "./lightCurvePlotMath";
import type { LightCurveHistoryState, ResolvedLightCurvePlotOptions } from "./lightCurvePlotTypes";
import { getActiveLength, resolveLatestFiniteTime } from "./lightCurvePlotBuffer";
import { getFullVisibleTimeDomainInfo, scanVisibleTimeDomain } from "./lightCurvePlotTimeDomain";
import {
  canUseLiveTimeWindow,
  fallbackScannedWindow,
  fallbackVisibleWindow,
  fallbackWindowStart,
  fullVisibleWindow,
  liveTimeWindow,
} from "./lightCurvePlotViewportWindow";

export function getVisibleWindowInfo(
  state: LightCurveHistoryState,
  opts: ResolvedLightCurvePlotOptions,
): VisibleWindow {
  const n = getActiveLength(state);
  if (n <= 1 || opts.trackingMode !== "live") {
    return fullVisibleWindow(state, opts, n);
  }

  const fallbackStart = fallbackWindowStart(n, opts);
  if (!canUseLiveTimeWindow(state, opts, n)) return fallbackVisibleWindow(fallbackStart, n, null);

  const lastFiniteT = resolveLatestFiniteTime(state, n);
  if (!Number.isFinite(lastFiniteT)) {
    return fallbackScannedWindow(state, opts, fallbackStart, n);
  }

  const latestFiniteOffset = state.latestFiniteTimeIndex - state.startIndex;
  if (latestFiniteOffset !== n - 1) {
    return fallbackScannedWindow(state, opts, fallbackStart, n);
  }

  return liveTimeWindow(state, opts, n, fallbackStart, lastFiniteT);
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
