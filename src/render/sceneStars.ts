/**
 * Owns scene Stars support within the render layer. Keeps visual projection and drawing concerns out of simulation state.
 */
import type { SystemParams } from "../core/types";
import { clamp, toFinitePositiveOr } from "../core/units";

import { drawStarDisk, type StarDiskCache } from "./starDisk";
import type { ScratchPoint, ToPxInto } from "./sceneTypes";

function drawStarHalo(args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  pixelsPerUnit: number;
  x: number;
  y: number;
  r: number;
  z: number;
  innerColor: string;
  outerColor: string;
  radiusScale: number;
  alphaScale: number;
}): void {
  const {
    ctx,
    toPxInto,
    scratchPoint,
    pixelsPerUnit,
    x,
    y,
    r,
    z,
    innerColor,
    outerColor,
    radiusScale,
    alphaScale,
  } = args;
  const p = toPxInto(x, y, scratchPoint);
  const baseRadiusPx = toFinitePositiveOr(r, 1e-6) * pixelsPerUnit;
  const haloRadiusPx = Math.max(6, baseRadiusPx * radiusScale);
  const depthFade = clamp(0.25 + 0.75 * (1 / (1 + Math.abs(z) * 0.002)), 0.2, 1);

  ctx.save();
  ctx.globalAlpha = clamp(alphaScale * depthFade, 0.08, 0.9);
  const gradient = ctx.createRadialGradient(p.x, p.y, baseRadiusPx * 0.2, p.x, p.y, haloRadiusPx);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(1, outerColor);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(p.x, p.y, haloRadiusPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawStarGeometry(args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  pixelsPerUnit: number;
  starDiskCache: StarDiskCache;
  params: SystemParams;
  x: number;
  y: number;
  r: number;
  z: number;
  variant: "primary" | "secondary";
  resolveSecondaryStarParams: (r: number) => SystemParams;
}): void {
  const {
    ctx,
    toPxInto,
    scratchPoint,
    pixelsPerUnit,
    starDiskCache,
    params,
    x,
    y,
    r,
    z,
    variant,
    resolveSecondaryStarParams,
  } = args;
  const centerPx = toPxInto(x, y, scratchPoint);
  const starParams = variant === "primary" ? params : resolveSecondaryStarParams(r);

  if (variant === "primary") {
    drawStarHalo({
      ctx,
      toPxInto,
      scratchPoint,
      pixelsPerUnit,
      x,
      y,
      r,
      z,
      innerColor: "rgba(255, 224, 169, 0.28)",
      outerColor: "rgba(245, 176, 76, 0)",
      radiusScale: 1.85,
      alphaScale: 0.75,
    });
  } else {
    drawStarHalo({
      ctx,
      toPxInto,
      scratchPoint,
      pixelsPerUnit,
      x,
      y,
      r,
      z,
      innerColor: "rgba(173, 222, 255, 0.20)",
      outerColor: "rgba(120, 185, 255, 0)",
      radiusScale: 1.55,
      alphaScale: 0.62,
    });
  }

  drawStarDisk(ctx, starParams, {
    centerPx,
    pixelsPerUnit,
    useLimbDarkening: variant === "primary",
    cache: starDiskCache,
    showPatches: variant === "primary",
    drawOutline: true,
    baseColor: variant === "primary" ? "#f2a33a" : "#9fc8ff",
    highlightColor: variant === "primary" ? "#ffe1a6" : "#e7f2ff",
    outlineStyle:
      variant === "primary"
        ? { strokeStyle: "rgba(255, 244, 215, 0.35)", lineWidth: 1.1 }
        : { strokeStyle: "rgba(212, 232, 255, 0.32)", lineWidth: 1 },
  });

  if (variant !== "secondary") return;

  const rr = toFinitePositiveOr(r, 1e-6) * pixelsPerUnit;
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "rgba(255,255,255,0.26)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centerPx.x, centerPx.y, rr * 1.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
