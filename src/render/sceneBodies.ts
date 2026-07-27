/**
 * Owns scene Bodies support within the render layer. Keeps visual projection and drawing concerns out of simulation state.
 */
import { clamp, toFinitePositiveOr } from "../core/units";

import type { ScratchPoint, ToPxInto } from "./sceneTypes";

function drawBodyDisk(args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  pixelsPerUnit: number;
  x: number;
  y: number;
  r: number;
  z: number;
  baseColor: string;
}): void {
  const { ctx, toPxInto, scratchPoint, pixelsPerUnit, x, y, r, z, baseColor } = args;
  const p = toPxInto(x, y, scratchPoint);
  const rr = toFinitePositiveOr(r, 1e-6) * pixelsPerUnit;
  const shade = clamp(0.35 + 0.65 * (1 / (1 + Math.abs(z) * 0.002)), 0.25, 1);

  ctx.save();
  ctx.globalAlpha = shade;
  ctx.beginPath();
  ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
  ctx.fillStyle = baseColor;
  ctx.fill();
  ctx.restore();
}

export function drawBodyWithOcclusionHint(args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  pixelsPerUnit: number;
  x: number;
  y: number;
  rBody: number;
  zBody: number;
  rStar: number;
  baseColor: string;
}): void {
  const { ctx, toPxInto, scratchPoint, pixelsPerUnit, x, y, rBody, zBody, rStar, baseColor } = args;

  drawBodyDisk({ ctx, toPxInto, scratchPoint, pixelsPerUnit, x, y, r: rBody, z: zBody, baseColor });

  const behindStarPlane = zBody < 0;
  const centerInsideStarDisk = Math.hypot(x, y) < toFinitePositiveOr(rStar, 1);
  if (!(behindStarPlane && centerInsideStarDisk)) return;

  const p = toPxInto(x, y, scratchPoint);
  const radiusPx = toFinitePositiveOr(rBody, 1e-6) * pixelsPerUnit;

  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = "rgba(255,255,255,0.70)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, radiusPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawEllipseBodyWithOcclusionHint(args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  pixelsPerUnit: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
  angle: number;
  zBody: number;
  rStar: number;
  baseColor: string;
}): void {
  const { ctx, toPxInto, scratchPoint, pixelsPerUnit, x, y, rx, ry, angle, zBody, rStar, baseColor } = args;
  const p = toPxInto(x, y, scratchPoint);
  const rxPx = toFinitePositiveOr(rx, 1e-6) * pixelsPerUnit;
  const ryPx = toFinitePositiveOr(ry, 1e-6) * pixelsPerUnit;
  const ang = Number.isFinite(angle) ? angle : 0;
  const shade = clamp(0.35 + 0.65 * (1 / (1 + Math.abs(zBody) * 0.002)), 0.25, 1);

  ctx.save();
  ctx.globalAlpha = shade;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rxPx, ryPx, ang, 0, Math.PI * 2);
  ctx.fillStyle = baseColor;
  ctx.fill();
  ctx.restore();

  const behindStarPlane = zBody < 0;
  const centerInsideStarDisk = Math.hypot(x, y) < toFinitePositiveOr(rStar, 1);
  if (!(behindStarPlane && centerInsideStarDisk)) return;

  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = "rgba(255,255,255,0.70)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rxPx, ryPx, ang, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function bodyColor(body: "planet" | "moon" | "star"): string {
  if (body === "star") return "#f5b04c";
  return body === "planet" ? "#4cc9f0" : "#b8c0cc";
}
