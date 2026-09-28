/** Draws clipped brightness-patch geometry over a stellar disk. */
import type { BrightnessPatch } from "../../../domain/model/types";
import { clamp } from "../../../domain/model/units";

export const drawBrightnessPatches = (params: {
  ctx: CanvasRenderingContext2D;
  centerPx: { x: number; y: number };
  pixelsPerUnit: number;
  starRadius: number;
  patchStrength: number;
  patches: BrightnessPatch[];
}): void => {
  const setup = brightnessPatchSetup(params);
  if (!setup) return;
  const { ctx, centerPx, pixelsPerUnit, patches } = params;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerPx.x, centerPx.y, setup.radiusPx, 0, Math.PI * 2);
  ctx.clip();
  for (const patch of patches) drawBrightnessPatch(ctx, centerPx, pixelsPerUnit, setup.strength, patch);
  ctx.restore();
};

const brightnessPatchSetup = (params: {
  pixelsPerUnit: number;
  starRadius: number;
  patchStrength: number;
}): { radiusPx: number; strength: number } | null => {
  if (!Number.isFinite(params.pixelsPerUnit) || params.pixelsPerUnit <= 0) return null;
  if (!Number.isFinite(params.starRadius) || params.starRadius <= 0) return null;
  const strength = clamp(params.patchStrength, 0, 1);
  return strength > 0 ? { radiusPx: params.starRadius * params.pixelsPerUnit, strength } : null;
};

const drawBrightnessPatch = (
  ctx: CanvasRenderingContext2D,
  centerPx: { x: number; y: number },
  pixelsPerUnit: number,
  strength: number,
  patch: BrightnessPatch,
): void => {
  const fillStyle = brightnessPatchFillStyle(patch, strength);
  if (!fillStyle) return;
  ctx.save();
  ctx.fillStyle = fillStyle;
  drawBrightnessPatchShape(ctx, patch, patchCenterPx(centerPx, pixelsPerUnit, patch), pixelsPerUnit);
  ctx.restore();
};

const brightnessPatchFillStyle = (patch: BrightnessPatch, strength: number): string | null => {
  const factor = finitePatchValue(patch.factor, 1);
  if (factor === 1) return null;
  const alpha = clamp(Math.abs(1 - factor) * 0.7 * strength, 0, 0.85);
  return factor < 1 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
};

const patchCenterPx = (
  centerPx: { x: number; y: number },
  pixelsPerUnit: number,
  patch: BrightnessPatch,
): { x: number; y: number } => ({
  x: centerPx.x + finitePatchValue(patch.x, 0) * pixelsPerUnit,
  y: centerPx.y - finitePatchValue(patch.y, 0) * pixelsPerUnit,
});

const drawBrightnessPatchShape = (
  ctx: CanvasRenderingContext2D,
  patch: BrightnessPatch,
  centerPx: { x: number; y: number },
  pixelsPerUnit: number,
): void => {
  if (patch.shape === "circle") {
    const radius = finitePatchValue(patch.r, 0) * pixelsPerUnit;
    if (!(radius > 0)) return;
    ctx.beginPath();
    ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (patch.shape !== "ellipse") return;
  const radiusX = finitePatchValue(patch.rx, 0) * pixelsPerUnit;
  const radiusY = finitePatchValue(patch.ry, 0) * pixelsPerUnit;
  if (!(radiusX > 0 && radiusY > 0)) return;
  ctx.beginPath();
  ctx.ellipse(centerPx.x, centerPx.y, radiusX, radiusY, finitePatchValue(patch.angle, 0), 0, Math.PI * 2);
  ctx.fill();
};

const finitePatchValue = (value: number | undefined, fallback: number): number => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};
