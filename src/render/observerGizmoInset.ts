/**
 * Owns observer Gizmo Inset support within the render layer. Keeps visual projection and drawing concerns out of simulation state.
 */
import { clamp } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import type { SizeInfo } from "./canvasUtil";
import type { OverlayTheme } from "./overlays";

const canvasSizeValid = (size: SizeInfo): boolean =>
  Number.isFinite(size.cssW) && Number.isFinite(size.cssH) && size.cssW >= 1 && size.cssH >= 1;

/** Cross-browser rounded rectangle path helper. */
const pathRoundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void => {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
  if ("roundRect" in ctx && typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rr);
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
};

const finiteDirectionComponent = (value: number, fallback: number): number => {
  return Number.isFinite(value) ? value : fallback;
};

const normalizedGizmoDirection = (observerDir: Vec3): Vec3 => {
  const dx = finiteDirectionComponent(observerDir.x, 0);
  const dyWorld = finiteDirectionComponent(observerDir.y, 0);
  const dz = finiteDirectionComponent(observerDir.z, 1);
  const r3 = Math.hypot(dx, dyWorld, dz) || 1;
  return { x: dx / r3, y: dyWorld / r3, z: dz / r3 };
};

const drawEye = (ctx: CanvasRenderingContext2D, eyeCx: number, eyeCy: number, th: OverlayTheme): void => {
  ctx.save();
  ctx.translate(eyeCx, eyeCy);
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.80)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = th.accent;
  ctx.fill();
  ctx.restore();
};

const drawSphereAxisLabels = (
  ctx: CanvasRenderingContext2D,
  sphCx: number,
  sphCy: number,
  sphR: number,
  th: OverlayTheme,
): void => {
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = th.fontSmall;
  ctx.fillText("+x", sphCx + sphR + 4, sphCy + 3);
  ctx.fillText("-x", sphCx - sphR - 20, sphCy + 3);
  ctx.fillText("+y", sphCx - 7, sphCy - sphR - 4);
  ctx.fillText("-y", sphCx - 7, sphCy + sphR + 12);
};

const drawSphereDirectionMarker = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  zN: number,
  th: OverlayTheme,
): void => {
  if (zN >= 0) {
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = th.accent;
    ctx.fill();
    return;
  }

  ctx.strokeStyle = th.warn;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px - 4, py - 4);
  ctx.lineTo(px + 4, py + 4);
  ctx.moveTo(px + 4, py - 4);
  ctx.lineTo(px - 4, py + 4);
  ctx.stroke();
};

const drawSphereWidget = (
  ctx: CanvasRenderingContext2D,
  boxW: number,
  eyeCy: number,
  direction: Vec3,
  th: OverlayTheme,
): void => {
  const sphCx = boxW - 70;
  const sphCy = eyeCy;
  const sphR = 22;

  ctx.beginPath();
  ctx.arc(sphCx, sphCy, sphR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();

  drawSphereAxisLabels(ctx, sphCx, sphCy, sphR, th);
  drawSphereDirectionMarker(ctx, sphCx + direction.x * sphR, sphCy + -direction.y * sphR, direction.z, th);
};

const drawGizmoLabels = (
  ctx: CanvasRenderingContext2D,
  boxH: number,
  direction: Vec3,
  th: OverlayTheme,
): void => {
  const phiDeg = (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
  const thetaDeg = (Math.acos(clamp(direction.z, -1, 1)) * 180) / Math.PI;

  ctx.fillStyle = "rgba(255,255,255,0.80)";
  ctx.font = th.font;
  ctx.fillText("Viewing direction", 56, 18);
  ctx.font = th.fontSmall;
  ctx.fillText("line of sight: star → observer", 56, boxH - 36);
  ctx.fillText(`azimuth φ = ${phiDeg.toFixed(0)}°`, 56, boxH - 22);
  ctx.fillText(`tilt θ = ${thetaDeg.toFixed(0)}°`, 56, boxH - 8);
};

/**
 * Draw an inset observer-direction gizmo (panel with eye + sphere marker).
 * This is a visualization aid only and does not influence physics. [file:119]
 */
export function drawObserverGizmoInsetResolved(
  ctx: CanvasRenderingContext2D,
  size: SizeInfo,
  observerDir: Vec3,
  th: OverlayTheme,
): void {
  if (!canvasSizeValid(size) || size.cssW < 40 || size.cssH < 40) return;

  const pad = 12;
  const boxW = Math.max(160, Math.min(250, size.cssW - 2 * pad));
  const boxH = Math.max(64, Math.min(84, size.cssH - 2 * pad));
  const x0 = Math.max(pad, size.cssW - pad - boxW);
  const y0 = pad;
  const direction = normalizedGizmoDirection(observerDir);
  const eyeCy = boxH * 0.5;

  ctx.save();
  ctx.translate(x0, y0);
  pathRoundRect(ctx, 0, 0, boxW, boxH, 10);
  ctx.fillStyle = th.panelFill;
  ctx.fill();
  ctx.strokeStyle = th.panelStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawEye(ctx, 30, eyeCy, th);
  drawSphereWidget(ctx, boxW, eyeCy, direction, th);
  drawGizmoLabels(ctx, boxH, direction, th);
  ctx.restore();
}
