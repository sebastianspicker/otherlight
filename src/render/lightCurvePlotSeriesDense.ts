import type { DrawSeriesArgs } from "./lightCurvePlotSeries";

export function drawDenseIndexSeries(args: DrawSeriesArgs): void {
  const { ctx, fluxValues, visibleStart, n, xIndexOffset, indexScale, yOffset, yScale } = args;
  ctx.moveTo(xIndexOffset, yOffset + fluxValues[visibleStart] * yScale);
  for (let i = 1; i < n; i++) {
    ctx.lineTo(xIndexOffset + i * indexScale, yOffset + fluxValues[visibleStart + i] * yScale);
  }
}

export function drawDenseFiniteTimeSeries(args: DrawSeriesArgs): void {
  const { ctx, fluxValues, timeValues, visibleStart, n, xTimeOffset, timeScale, yOffset, yScale } = args;
  ctx.moveTo(xTimeOffset + timeValues[visibleStart] * timeScale, yOffset + fluxValues[visibleStart] * yScale);
  for (let i = 1; i < n; i++) {
    const index = visibleStart + i;
    ctx.lineTo(xTimeOffset + timeValues[index] * timeScale, yOffset + fluxValues[index] * yScale);
  }
}
