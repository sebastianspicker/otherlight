/**
 * Resolves the visible light-curve window.
 */
import type { VisibleWindow } from "./lightCurvePlotMath";
import type { LightCurveHistoryState, ResolvedLightCurvePlotOptions } from "./lightCurvePlotTypes";
import { getActiveLength, resolveLatestFiniteTime } from "./lightCurvePlotBuffer";
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
