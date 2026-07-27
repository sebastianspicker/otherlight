/**
 * Owns light Curve Plot Math support within the render layer. Keeps visual projection and drawing concerns out of simulation state.
 */
import { clamp } from "../core/units";

function sortFiniteScratchPrefix(values: number[], count: number): void {
  if (values.length > count) values.length = count;
  values.sort((a, b) => a - b);
}

function quantileFromSorted(values: number[], count: number, q: number): number {
  const qq = clamp(q, 0, 1);
  if (count === 1) return values[0];

  const idx = (count - 1) * qq;
  const i0 = Math.floor(idx);
  const i1 = Math.min(count - 1, i0 + 1);
  const f = idx - i0;
  const v0 = values[i0];
  if (i1 === i0) return v0;
  const v1 = values[i1];
  return v0 * (1 - f) + v1 * f;
}

const robustScratch: number[] = [];

export type VisibleFluxStats = {
  finiteCount: number;
  sum: number;
  min: number;
  max: number;
  constantValue: number;
};

export type VisibleFluxCollection = {
  stats: VisibleFluxStats;
  robustCount: number;
};

type MutableVisibleFluxStats = VisibleFluxStats;

export type VisibleTimeDomain = {
  tMin: number;
  tMax: number;
  allFinite: boolean;
};

export type VisibleWindow = {
  start: number;
  end: number;
  timeDomain: VisibleTimeDomain | null;
};

export function collectVisibleFlux(
  values: number[],
  start: number,
  end: number,
  collectRobustSamples: boolean,
): VisibleFluxCollection {
  const stats = emptyVisibleFluxStats();
  let robustCount = 0;

  for (let i = start; i < end; i++) {
    const value = values[i];
    if (!Number.isFinite(value)) continue;
    if (collectRobustSamples) {
      robustScratch[robustCount++] = value;
    }
    recordVisibleFlux(stats, value);
  }

  if (collectRobustSamples && robustScratch.length > robustCount) {
    robustScratch.length = robustCount;
  }

  return {
    stats,
    robustCount,
  };
}

function emptyVisibleFluxStats(): MutableVisibleFluxStats {
  return {
    finiteCount: 0,
    sum: 0,
    min: Number.POSITIVE_INFINITY,
    max: Number.NEGATIVE_INFINITY,
    constantValue: Number.NaN,
  };
}

function recordVisibleFlux(stats: MutableVisibleFluxStats, value: number): void {
  if (stats.finiteCount === 0) {
    recordFirstVisibleFlux(stats, value);
  } else {
    recordAdditionalVisibleFlux(stats, value);
  }
  stats.finiteCount++;
  stats.sum += value;
}

function recordFirstVisibleFlux(stats: MutableVisibleFluxStats, value: number): void {
  stats.constantValue = value;
  stats.min = value;
  stats.max = value;
}

function recordAdditionalVisibleFlux(stats: MutableVisibleFluxStats, value: number): void {
  if (value < stats.min) stats.min = value;
  if (value > stats.max) stats.max = value;
  if (value !== stats.constantValue) stats.constantValue = Number.NaN;
}

export function rangeFromStats(stats: VisibleFluxStats): { lo: number; hi: number } | null {
  if (stats.finiteCount < 2) return null;
  if (!Number.isFinite(stats.min) || !Number.isFinite(stats.max)) return null;
  if (stats.max <= stats.min) return null;
  return { lo: stats.min, hi: stats.max };
}

export function computeRobustRangeFromScratch(
  robustCount: number,
  qLo: number,
  qHi: number,
): { lo: number; hi: number } | null {
  if (robustCount < 2) return null;

  sortFiniteScratchPrefix(robustScratch, robustCount);
  const lo = quantileFromSorted(robustScratch, robustCount, qLo);
  const hi = quantileFromSorted(robustScratch, robustCount, qHi);

  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (hi <= lo) return null;

  return { lo, hi };
}
