/**
 * Owns light Curve Plot Time Domain support within the render layer. Keeps visual projection and drawing concerns out of simulation state.
 */
import { resolveEarliestFiniteTime, resolveLatestFiniteTime } from "./lightCurvePlotBuffer";
import type { VisibleTimeDomain } from "./lightCurvePlotMath";
import type { LightCurveHistoryState, ResolvedLightCurvePlotOptions } from "./lightCurvePlotTypes";

export function getFullVisibleTimeDomainInfo(
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

export function scanVisibleTimeDomain(
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
