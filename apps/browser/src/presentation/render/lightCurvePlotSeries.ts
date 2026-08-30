/**
 * Owns light Curve Plot Series support within the render layer. Keeps visual projection and drawing concerns out of simulation state.
 */
import { drawDenseFiniteTimeSeries, drawDenseIndexSeries } from "./lightCurvePlotSeriesDense";
import type { DrawSeriesArgs } from "./lightCurvePlotSeriesTypes";
export type { DrawSeriesArgs } from "./lightCurvePlotSeriesTypes";

export function computeTickLayout(
  lo: number,
  hi: number,
  maxTicks: number,
): { start: number; step: number } | null {
  const range = hi - lo;
  if (range <= 0 || !Number.isFinite(range)) return null;

  const roughStep = range / Math.max(2, maxTicks);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;

  let niceStep: number;
  if (normalized <= 1.5) niceStep = magnitude;
  else if (normalized <= 3.5) niceStep = 2 * magnitude;
  else if (normalized <= 7.5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  const start = Math.ceil(lo / niceStep) * niceStep;
  return { start, step: niceStep };
}

export function formatTickValue(v: number, range: number): string {
  if (!Number.isFinite(v)) return "";
  const fixedDigits = fixedDigitsForRange(range);
  if (fixedDigits !== null) return v.toFixed(fixedDigits);

  const absV = Math.abs(v);
  if (usesExponentialTick(absV)) return v.toExponential(1);
  const broadFixedDigits = broadFixedDigitsForRange(range);
  return v.toFixed(broadFixedDigits);
}

function fixedDigitsForRange(range: number): number | null {
  if (range < 0.001) return 6;
  if (range < 0.01) return 5;
  if (range < 0.1) return 4;
  if (range < 1) return 3;
  return null;
}

function usesExponentialTick(absV: number): boolean {
  return absV >= 1e4 || (absV > 0 && absV < 0.01);
}

function broadFixedDigitsForRange(range: number): number {
  if (range < 10) return 2;
  if (range < 100) return 1;
  return 0;
}

export function drawLightCurveSeries(args: DrawSeriesArgs): void {
  setupSeriesStroke(args.ctx);
  drawSeriesPath(args);
  args.ctx.stroke();
}

function setupSeriesStroke(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.strokeStyle = "#4cc9f0";
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
}

function drawSeriesPath(args: DrawSeriesArgs): void {
  if (!args.haveTime) {
    drawIndexSeries(args);
    return;
  }
  if (args.allFiniteTime) {
    drawFiniteTimeSeries(args);
    return;
  }
  drawMixedTimeSeries(args);
}

function drawIndexSeries(args: DrawSeriesArgs): void {
  if (shouldDrawDenseSeries(args)) {
    drawDenseIndexSeries(args);
    return;
  }
  drawDecimatedIndexSeries(args);
}

function drawFiniteTimeSeries(args: DrawSeriesArgs): void {
  if (shouldDrawDenseSeries(args)) {
    drawDenseFiniteTimeSeries(args);
    return;
  }
  drawDecimatedFiniteTimeSeries(args);
}

function drawMixedTimeSeries(args: DrawSeriesArgs): void {
  if (shouldDrawDenseSeries(args)) {
    drawDenseMixedTimeSeries(args);
    return;
  }
  drawDecimatedMixedTimeSeries(args);
}

function shouldDrawDenseSeries(args: DrawSeriesArgs): boolean {
  return args.n <= args.plotW * 2;
}

function drawDecimatedIndexSeries(args: DrawSeriesArgs): void {
  const { ctx, fluxValues, visibleStart, xIndexOffset, indexScale, yOffset, yScale } = args;
  ctx.moveTo(xIndexOffset, yOffset + fluxValues[visibleStart] * yScale);

  forEachChunk(args, (start, limit) => {
    const chunk = collectChunkExtrema(args, start, limit);
    if (!chunk) return;
    const x = xIndexOffset + Math.floor((start + limit) / 2) * indexScale;
    drawChunkExtrema(ctx, x, chunk, yOffset, yScale);
  });
}

function drawDecimatedFiniteTimeSeries(args: DrawSeriesArgs): void {
  const { ctx, fluxValues, timeValues, visibleStart, xTimeOffset, timeScale, yOffset, yScale } = args;
  ctx.moveTo(xTimeOffset + timeValues[visibleStart] * timeScale, yOffset + fluxValues[visibleStart] * yScale);

  forEachChunk(args, (start, limit) => {
    const chunk = collectChunkExtrema(args, start, limit);
    if (!chunk) return;
    const chunkMidIndex = visibleStart + Math.floor((start + limit) / 2);
    const x = xTimeOffset + timeValues[chunkMidIndex] * timeScale;
    drawChunkExtrema(ctx, x, chunk, yOffset, yScale);
  });
}

function drawDenseMixedTimeSeries(args: DrawSeriesArgs): void {
  const { ctx, fluxValues, timeValues, visibleStart, n, xIndexOffset, indexScale, yOffset, yScale } = args;
  moveToFirstMixedPoint(args);
  for (let i = 1; i < n; i++) {
    const index = visibleStart + i;
    const tt = timeValues[index];
    const x = Number.isFinite(tt) ? args.xTimeOffset + tt * args.timeScale : xIndexOffset + i * indexScale;
    ctx.lineTo(x, yOffset + fluxValues[index] * yScale);
  }
}

function drawDecimatedMixedTimeSeries(args: DrawSeriesArgs): void {
  const { ctx, yOffset, yScale } = args;
  moveToFirstMixedPoint(args);

  forEachChunk(args, (start, limit) => {
    const chunk = collectChunkExtrema(args, start, limit);
    if (!chunk) return;
    const x = mixedChunkX(args, Math.floor((start + limit) / 2));
    drawChunkExtrema(ctx, x, chunk, yOffset, yScale);
  });
}

function moveToFirstMixedPoint(args: DrawSeriesArgs): void {
  const { ctx, fluxValues, timeValues, visibleStart, xIndexOffset, xTimeOffset, timeScale, yOffset, yScale } =
    args;
  const firstTime = timeValues[visibleStart];
  const firstX = Number.isFinite(firstTime) ? xTimeOffset + firstTime * timeScale : xIndexOffset;
  ctx.moveTo(firstX, yOffset + fluxValues[visibleStart] * yScale);
}

function mixedChunkX(args: DrawSeriesArgs, chunkMid: number): number {
  const chunkMidIndex = args.visibleStart + chunkMid;
  const tt = args.timeValues[chunkMidIndex];
  return Number.isFinite(tt)
    ? args.xTimeOffset + tt * args.timeScale
    : args.xIndexOffset + chunkMid * args.indexScale;
}

type ChunkExtrema = {
  min: number;
  max: number;
  minIdx: number;
  maxIdx: number;
};

function forEachChunk(args: DrawSeriesArgs, visit: (start: number, limit: number) => void): void {
  const step = Math.max(1, Math.floor(args.n / args.plotW));
  for (let i = 1; i < args.n; i += step) {
    visit(i, Math.min(args.n, i + step));
  }
}

function collectChunkExtrema(args: DrawSeriesArgs, start: number, limit: number): ChunkExtrema | null {
  const chunk: ChunkExtrema = {
    min: Number.POSITIVE_INFINITY,
    max: Number.NEGATIVE_INFINITY,
    minIdx: -1,
    maxIdx: -1,
  };
  for (let j = start; j < limit; j++) {
    const value = args.fluxValues[args.visibleStart + j];
    recordChunkValue(chunk, value, j);
  }
  return chunk.minIdx !== -1 && chunk.maxIdx !== -1 ? chunk : null;
}

function recordChunkValue(chunk: ChunkExtrema, value: number, index: number): void {
  if (value < chunk.min) {
    chunk.min = value;
    chunk.minIdx = index;
  }
  if (value > chunk.max) {
    chunk.max = value;
    chunk.maxIdx = index;
  }
}

function drawChunkExtrema(
  ctx: CanvasRenderingContext2D,
  x: number,
  chunk: ChunkExtrema,
  yOffset: number,
  yScale: number,
): void {
  if (chunk.minIdx <= chunk.maxIdx) {
    ctx.lineTo(x, yOffset + chunk.min * yScale);
    ctx.lineTo(x, yOffset + chunk.max * yScale);
    return;
  }
  ctx.lineTo(x, yOffset + chunk.max * yScale);
  ctx.lineTo(x, yOffset + chunk.min * yScale);
}
