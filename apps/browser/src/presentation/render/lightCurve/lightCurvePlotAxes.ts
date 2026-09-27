/**
 * Axis and tick rendering for the light-curve plot.
 *
 * Exports:
 *  - `TimeScaleInfo`: shared layout descriptor used by axes and annotations.
 *  - `xOfTime`: converts a time value to a canvas x-coordinate.
 *  - `drawAxes`: draws the journal-style frame, inward ticks, faint flux rules and labels.
 */

import { FIGURE_FONTS, figureInk } from "../canvas/figureInk";
import { computeTickLayout, formatTickValue } from "./lightCurvePlotSeries";

/** Inward tick length in CSS pixels. */
const TICK = 5;

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
  const ink = figureInk();

  // Journal figure: a closed frame with inward ticks on all four sides.
  ctx.strokeStyle = ink.frame;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(marginLeft + 0.5, marginTop + 0.5, plotW - 1, plotH - 1);

  const yTickLayout = computeTickLayout(lo, hi, Math.min(6, Math.floor(plotH / 36)));
  ctx.font = `11px ${FIGURE_FONTS.mono}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (
    let tickVal = yTickLayout?.start ?? Number.NaN, tickCount = 0;
    Number.isFinite(tickVal) && tickVal <= hi + (yTickLayout?.step ?? 0) * 0.001 && tickCount <= 8;
    tickVal += yTickLayout?.step ?? 0, tickCount++
  ) {
    const yPos = Math.round(yOf(tickVal)) + 0.5;
    if (yPos < marginTop + 2 || yPos > marginTop + plotH - 2) continue;

    ctx.beginPath();
    ctx.strokeStyle = ink.grid;
    ctx.moveTo(marginLeft, yPos);
    ctx.lineTo(marginLeft + plotW, yPos);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = ink.frame;
    ctx.moveTo(marginLeft, yPos);
    ctx.lineTo(marginLeft + TICK, yPos);
    ctx.moveTo(marginLeft + plotW - TICK, yPos);
    ctx.lineTo(marginLeft + plotW, yPos);
    ctx.stroke();

    ctx.fillStyle = ink.ink2;
    ctx.fillText(formatTickValue(tickVal, yRange), marginLeft - 6, yPos);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (timeInfo.haveTime) {
    const xTickLayout = computeTickLayout(timeInfo.tMin, timeInfo.tMax, Math.min(8, Math.floor(plotW / 95)));
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
      const xPos = Math.round(tickOffset + tickVal * tickScale) + 0.5;
      if (xPos < marginLeft + 2 || xPos > marginLeft + plotW - 2) continue;

      ctx.beginPath();
      ctx.strokeStyle = ink.frame;
      ctx.moveTo(xPos, marginTop + plotH);
      ctx.lineTo(xPos, marginTop + plotH - TICK);
      ctx.moveTo(xPos, marginTop);
      ctx.lineTo(xPos, marginTop + TICK);
      ctx.stroke();

      ctx.fillStyle = ink.ink2;
      ctx.fillText(formatTickValue(tickVal, tickSpan), xPos, marginTop + plotH + 6);
    }
  }

  ctx.save();
  ctx.fillStyle = ink.ink;
  ctx.font = `italic 14px ${FIGURE_FONTS.serif}`;
  ctx.translate(13, marginTop + plotH * 0.5);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("F / F\u2080", 0, 0);
  ctx.restore();

  if (timeInfo.haveTime) {
    ctx.fillStyle = ink.ink;
    ctx.font = `italic 14px ${FIGURE_FONTS.serif}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    const cx = marginLeft + plotW * 0.5;
    ctx.fillText("t", cx - 1, h - 1);
    ctx.font = `14px ${FIGURE_FONTS.serif}`;
    ctx.textAlign = "left";
    ctx.fillText(" [s]", cx, h - 1);
  }
}
