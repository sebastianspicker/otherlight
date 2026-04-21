import { clamp } from "../core/units";

function partitionInPlace(values: number[], left: number, right: number, pivotIndex: number): number {
  const pivotValue = values[pivotIndex];
  [values[pivotIndex], values[right]] = [values[right], values[pivotIndex]];
  let storeIndex = left;
  for (let i = left; i < right; i++) {
    if (values[i] < pivotValue) {
      [values[storeIndex], values[i]] = [values[i], values[storeIndex]];
      storeIndex++;
    }
  }
  [values[right], values[storeIndex]] = [values[storeIndex], values[right]];
  return storeIndex;
}

function pickPivotIndex(values: number[], left: number, right: number): number {
  const mid = left + Math.floor((right - left) * 0.5);
  const a = values[left];
  const b = values[mid];
  const c = values[right];
  if (a < b) {
    if (b < c) return mid;
    return a < c ? right : left;
  }
  if (a < c) return left;
  return b < c ? right : mid;
}

function selectRankInPlace(values: number[], count: number, rank: number): number {
  let left = 0;
  let right = count - 1;
  while (left < right) {
    const pivotIndex = pickPivotIndex(values, left, right);
    const nextPivotIndex = partitionInPlace(values, left, right, pivotIndex);
    if (rank === nextPivotIndex) return values[nextPivotIndex];
    if (rank < nextPivotIndex) {
      right = nextPivotIndex - 1;
      continue;
    }
    left = nextPivotIndex + 1;
  }
  return values[left];
}

function quantileFromScratch(values: number[], count: number, q: number): number {
  const qq = clamp(q, 0, 1);
  if (count === 1) return values[0];

  const idx = (count - 1) * qq;
  const i0 = Math.floor(idx);
  const i1 = Math.min(count - 1, i0 + 1);
  const f = idx - i0;
  const v0 = selectRankInPlace(values, count, i0);
  if (i1 === i0) return v0;
  const v1 = selectRankInPlace(values, count, i1);
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
  let finiteCount = 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let constantValue = Number.NaN;
  let robustCount = 0;

  for (let i = start; i < end; i++) {
    const value = values[i];
    if (!Number.isFinite(value)) continue;
    if (collectRobustSamples) {
      robustScratch[robustCount++] = value;
    }
    if (finiteCount === 0) {
      constantValue = value;
      min = value;
      max = value;
    } else {
      if (value < min) min = value;
      if (value > max) max = value;
      if (value !== constantValue) constantValue = Number.NaN;
    }
    finiteCount++;
    sum += value;
  }

  if (collectRobustSamples && robustScratch.length > robustCount) {
    robustScratch.length = robustCount;
  }

  return {
    stats: { finiteCount, sum, min, max, constantValue },
    robustCount,
  };
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

  const lo = quantileFromScratch(robustScratch, robustCount, qLo);
  const hi = quantileFromScratch(robustScratch, robustCount, qHi);

  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (hi <= lo) return null;

  return { lo, hi };
}
