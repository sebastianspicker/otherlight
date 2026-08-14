/** Renders labelled timing markers on the light-curve plot. */

import { type TimeScaleInfo, xOfTime } from "./lightCurvePlotAxes";
import type { LightCurveMarker } from "./lightCurvePlotTypes";

type MarkerRows = { top: number; bottom: number };

type MarkerDrawArgs = {
  ctx: CanvasRenderingContext2D;
  marker: LightCurveMarker;
  x: number;
  yOf: (flux: number) => number;
  marginLeft: number;
  marginTop: number;
  plotW: number;
  plotH: number;
  rows: MarkerRows;
};

export function drawMarkers(args: {
  ctx: CanvasRenderingContext2D;
  markers: LightCurveMarker[];
  timeInfo: TimeScaleInfo;
  yOf: (flux: number) => number;
  marginLeft: number;
  marginTop: number;
  plotW: number;
  plotH: number;
}): void {
  const { ctx, markers, timeInfo, yOf, marginLeft, marginTop, plotW, plotH } = args;
  if (!timeInfo.haveTime) return;

  const rows: MarkerRows = { top: 0, bottom: 0 };
  for (const marker of markers) {
    const x = visibleMarkerX(marker, timeInfo, marginLeft, plotW);
    if (x === null) continue;
    drawMarker({ ctx, marker, x, yOf, marginLeft, marginTop, plotW, plotH, rows });
  }
}

function visibleMarkerX(
  marker: LightCurveMarker,
  timeInfo: TimeScaleInfo,
  marginLeft: number,
  plotW: number,
): number | null {
  if (!Number.isFinite(marker.tSec)) return null;
  if (marker.tSec < timeInfo.tMin || marker.tSec > timeInfo.tMax) return null;
  const x = xOfTime(timeInfo, marker.tSec);
  return x < marginLeft || x > marginLeft + plotW ? null : x;
}

function drawMarker(args: MarkerDrawArgs): void {
  const { ctx, marker, x, yOf, marginLeft, marginTop, plotW, plotH, rows } = args;
  const color = marker.color ?? "rgba(255, 214, 102, 0.92)";
  ctx.save();
  drawMarkerLine({ ctx, marker, x, color, marginTop, plotH });
  const label = markerLabelPosition(marker, rows, marginTop, plotH);
  drawMarkerLabel({ ctx, text: marker.label, x, yLabel: label.y, color, marginLeft, plotW });
  drawMarkerTick({ ctx, x, yTick: label.alignBottom ? marginTop + plotH : yOf(1), color, marginTop, plotH });
  ctx.restore();
}

function markerLabelPosition(
  marker: LightCurveMarker,
  rows: MarkerRows,
  marginTop: number,
  plotH: number,
): { alignBottom: boolean; y: number } {
  if (marker.align === "bottom") {
    const y = marginTop + plotH - 14 - rows.bottom * 12;
    rows.bottom += 1;
    return { alignBottom: true, y };
  }
  const y = marginTop + 6 + rows.top * 12;
  rows.top += 1;
  return { alignBottom: false, y };
}

function drawMarkerLine(args: {
  ctx: CanvasRenderingContext2D;
  marker: LightCurveMarker;
  x: number;
  color: string;
  marginTop: number;
  plotH: number;
}): void {
  const { ctx, marker, x, color, marginTop, plotH } = args;
  ctx.strokeStyle = color;
  ctx.globalAlpha = marker.emphasized ? 0.95 : 0.7;
  ctx.lineWidth = marker.emphasized ? 1.5 : 1;
  ctx.setLineDash(marker.kind === "timing" ? [4, 4] : [2, 3]);
  ctx.beginPath();
  ctx.moveTo(x, marginTop);
  ctx.lineTo(x, marginTop + plotH);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawMarkerLabel(args: {
  ctx: CanvasRenderingContext2D;
  text: string;
  x: number;
  yLabel: number;
  color: string;
  marginLeft: number;
  plotW: number;
}): void {
  const { ctx, text, x, yLabel, color, marginLeft, plotW } = args;
  ctx.fillStyle = "rgba(6, 10, 16, 0.84)";
  const width = ctx.measureText(text).width + 10;
  const textX = Math.max(marginLeft + width * 0.5, Math.min(marginLeft + plotW - width * 0.5, x));
  ctx.fillRect(textX - width * 0.5, yLabel - 1, width, 12);
  ctx.fillStyle = color;
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(text, textX, yLabel);
}

function drawMarkerTick(args: {
  ctx: CanvasRenderingContext2D;
  x: number;
  yTick: number;
  color: string;
  marginTop: number;
  plotH: number;
}): void {
  const { ctx, x, yTick, color, marginTop, plotH } = args;
  if (!Number.isFinite(yTick)) return;
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(x, Math.min(marginTop + plotH - 3, Math.max(marginTop + 3, yTick)), 2.2, 0, Math.PI * 2);
  ctx.fill();
}
