/**
 * Axis and tick rendering for the light-curve plot.
 *
 * Exports:
 *  - `TimeScaleInfo`: shared layout descriptor used by axes and annotations.
 *  - `xOfTime`: converts a time value to a canvas x-coordinate.
 *  - `drawAxes`: draws the plot border, Y/X grid lines, tick marks and labels.
 */

import { computeTickLayout, formatTickValue } from "./lightCurvePlotSeries";

export type TimeScaleInfo = {
  haveTime: boolean;
  allFiniteTime: boolean;
  tMin: number;
  tMax: number;
  tSpan: number;
  timeScale: number;
  xTimeOffset: number;
  plotW: number;
  marginLeft: number;
};

export function xOfTime(timeInfo: TimeScaleInfo, tSec: number): number {
  return timeInfo.xTimeOffset + tSec * timeInfo.timeScale;
}

export function drawAxes(args: {
  ctx: CanvasRenderingContext2D;
  lo: number;
  hi: number;
  yRange: number;
  yOf: (flux: number) => number;
  timeInfo: TimeScaleInfo;
  marginLeft: number;
  marginTop: number;
  plotW: number;
  plotH: number;
  h: number;
}): void {
  const { ctx, lo, hi, yRange, yOf, timeInfo, marginLeft, marginTop, plotW, plotH, h } = args;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(marginLeft, marginTop, plotW, plotH);
  ctx.stroke();

  const yTickLayout = computeTickLayout(lo, hi, Math.min(6, Math.floor(plotH / 36)));
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (
    let tickVal = yTickLayout?.start ?? Number.NaN, tickCount = 0;
    Number.isFinite(tickVal) && tickVal <= hi + (yTickLayout?.step ?? 0) * 0.001 && tickCount <= 8;
    tickVal += yTickLayout?.step ?? 0, tickCount++
  ) {
    const yPos = yOf(tickVal);
    if (yPos < marginTop + 2 || yPos > marginTop + plotH - 2) continue;

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.moveTo(marginLeft, yPos);
    ctx.lineTo(marginLeft + plotW, yPos);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.moveTo(marginLeft - 4, yPos);
    ctx.lineTo(marginLeft, yPos);
    ctx.stroke();

    ctx.fillStyle = "rgba(169, 184, 198, 0.9)";
    ctx.fillText(formatTickValue(tickVal, yRange), marginLeft - 6, yPos);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (timeInfo.haveTime) {
    const xTickLayout = computeTickLayout(timeInfo.tMin, timeInfo.tMax, Math.min(8, Math.floor(plotW / 80)));
    const tickSpan = Math.max(1e-12, timeInfo.tMax - timeInfo.tMin);
    const tickScale = plotW / tickSpan;
    const tickOffset = marginLeft - timeInfo.tMin * tickScale;
    for (
      let tickVal = xTickLayout?.start ?? Number.NaN, tickCount = 0;
      Number.isFinite(tickVal) &&
      tickVal <= timeInfo.tMax + (xTickLayout?.step ?? 0) * 0.001 &&
      tickCount <= 10;
      tickVal += xTickLayout?.step ?? 0, tickCount++
    ) {
      const xPos = tickOffset + tickVal * tickScale;
      if (xPos < marginLeft + 2 || xPos > marginLeft + plotW - 2) continue;

      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.moveTo(xPos, marginTop);
      ctx.lineTo(xPos, marginTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1;
      ctx.moveTo(xPos, marginTop + plotH);
      ctx.lineTo(xPos, marginTop + plotH + 4);
      ctx.stroke();

      ctx.fillStyle = "rgba(169, 184, 198, 0.9)";
      ctx.fillText(formatTickValue(tickVal, tickSpan), xPos, marginTop + plotH + 6);
    }
  }

  ctx.save();
  ctx.fillStyle = "rgba(208, 219, 229, 0.8)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.translate(12, marginTop + plotH * 0.5);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("F / F\u2080", 0, 0);
  ctx.restore();

  if (timeInfo.haveTime) {
    ctx.fillStyle = "rgba(208, 219, 229, 0.8)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("t [s]", marginLeft + plotW * 0.5, h - 10);
  }
}
