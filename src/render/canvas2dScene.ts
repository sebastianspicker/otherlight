import type { SystemParams } from "../core/types";
import { clamp, toFinitePositiveOr } from "../core/units";
import type { RenderOcculterGeometryV3, SimulationStepV3 } from "../sim/v3/types";

import { drawStarDisk, type StarDiskCache } from "./starDisk";
import type { DebugOverlayDataV3 } from "./overlays";

const MONO_FONT = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

type ScratchPoint = { x: number; y: number };
type ToPxInto = (x: number, y: number, out: ScratchPoint) => ScratchPoint;

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
  const g = ctx.createRadialGradient(p.x, p.y, baseRadiusPx * 0.2, p.x, p.y, haloRadiusPx);
  g.addColorStop(0, innerColor);
  g.addColorStop(1, outerColor);
  ctx.fillStyle = g;
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

  const shade = clamp(0.35 + 0.65 * (1 / (1 + Math.abs(z) * 0.002)), 0.25, 1.0);

  ctx.save();
  ctx.globalAlpha = shade;
  ctx.beginPath();
  ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
  ctx.fillStyle = baseColor;
  ctx.fill();
  ctx.restore();
}

function drawBodyWithOcclusionHint(args: {
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
  const R = toFinitePositiveOr(rBody, 1e-6) * pixelsPerUnit;

  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = "rgba(255,255,255,0.70)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawEllipseBodyWithOcclusionHint(args: {
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

  const shade = clamp(0.35 + 0.65 * (1 / (1 + Math.abs(zBody) * 0.002)), 0.25, 1.0);

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

function drawRingAnnulus(args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  pixelsPerUnit: number;
  x: number;
  y: number;
  z: number;
  innerRadius: number;
  outerRadius: number;
  inclination: number;
  angle: number;
  color: string;
}): void {
  const {
    ctx,
    toPxInto,
    scratchPoint,
    pixelsPerUnit,
    x,
    y,
    z,
    innerRadius,
    outerRadius,
    inclination,
    angle,
    color,
  } = args;
  const p = toPxInto(x, y, scratchPoint);
  const q = Math.max(0.05, Math.abs(Math.cos(Number.isFinite(inclination) ? inclination : 0)));
  const outerRx = toFinitePositiveOr(outerRadius, 1e-6) * pixelsPerUnit;
  const innerRx = toFinitePositiveOr(innerRadius, 1e-6) * pixelsPerUnit;
  const outerRy = outerRx * q;
  const innerRy = innerRx * q;
  const ang = Number.isFinite(angle) ? angle : 0;

  const shade = clamp(0.25 + 0.7 * (1 / (1 + Math.abs(z) * 0.002)), 0.2, 1.0);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  ctx.globalAlpha = shade;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, outerRx, outerRy, 0, 0, Math.PI * 2);
  ctx.ellipse(0, 0, innerRx, innerRy, 0, 0, Math.PI * 2, true);
  ctx.fill("evenodd");

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, outerRx, outerRy, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, innerRx, innerRy, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function bodyColor(body: "planet" | "moon" | "star"): string {
  if (body === "star") return "#f5b04c";
  return body === "planet" ? "#4cc9f0" : "#b8c0cc";
}

function ringColor(body: "planet" | "moon" | "star"): string {
  if (body === "star") return "rgba(245, 176, 76, 0.28)";
  return body === "planet" ? "rgba(120, 210, 255, 0.38)" : "rgba(205, 212, 220, 0.32)";
}

export function resolveOcculterGeometry(
  params: SystemParams,
  step: SimulationStepV3,
): RenderOcculterGeometryV3[] {
  const fromSignals = step.renderSignals?.occulterGeometry ?? [];
  if (fromSignals.length > 0) return fromSignals;

  const fallback: RenderOcculterGeometryV3[] = [
    {
      body: "planet",
      kind: "circle",
      center: step.kinematics.planetSky,
      radius: params.planet.r,
    },
  ];
  if (params.moon && step.kinematics.moonSky) {
    fallback.push({
      body: "moon",
      kind: "circle",
      center: step.kinematics.moonSky,
      radius: params.moon.r,
    });
  }
  return fallback;
}

export function fillOverlayData(overlayData: DebugOverlayDataV3, step: SimulationStepV3): DebugOverlayDataV3 {
  overlayData.nOcculters = step.debug?.nOcculters ?? step.renderSignals.occulterGeometry.length;
  overlayData.bPlanet = step.debug?.bPlanet;
  overlayData.bMoon = step.debug?.bMoon;
  overlayData.tdvRatio = step.debug?.tdvRatio;
  overlayData.vPlanetSky = step.debug?.vPlanetSky;
  overlayData.vPlanetSkyRef = step.debug?.vPlanetSkyRef;
  overlayData.baselineFluxUsed = step.debug?.baselineFluxUsed ?? step.flux.stellarPreTransit;
  overlayData.displayFluxValue = step.debug?.displayFluxValue ?? step.flux.total;
  overlayData.stellarVariabilityFlux = step.debug?.stellarVariabilityFlux ?? step.flux.stellarVariability;
  overlayData.fluxTransitFactor = step.flux.transitFactor;
  overlayData.fluxTotal = step.flux.total;
  return overlayData;
}

export function drawEventMarkers(args: {
  ctx: CanvasRenderingContext2D;
  cssH: number;
  markers: SimulationStepV3["renderSignals"]["eventMarkers"];
}): void {
  const { ctx, cssH, markers } = args;
  let activeCount = 0;
  for (const marker of markers) {
    if (marker.active) activeCount++;
  }
  if (activeCount === 0) return;

  const x0 = 10;
  let y = Math.max(20, cssH - 20 - activeCount * 18);

  ctx.save();
  ctx.font = MONO_FONT;
  for (const marker of markers) {
    if (!marker.active) continue;
    ctx.fillStyle = "rgba(20,20,20,0.65)";
    const text = `event: ${marker.label}`;
    const w = ctx.measureText(text).width + 12;
    ctx.fillRect(x0 - 4, y - 10, w, 14);
    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.fillText(text, x0, y);
    y += 16;
  }
  ctx.restore();
}

export function drawOcculterGeometry(args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  pixelsPerUnit: number;
  starDiskCache: StarDiskCache;
  secondaryStarParamsScratch: SystemParams;
  geometry: RenderOcculterGeometryV3;
  rStar: number;
  resolveSecondaryStarParams: (r: number) => SystemParams;
}): void {
  const {
    ctx,
    toPxInto,
    scratchPoint,
    pixelsPerUnit,
    starDiskCache,
    secondaryStarParamsScratch,
    geometry,
    rStar,
    resolveSecondaryStarParams,
  } = args;

  if (geometry.body === "star" && geometry.kind === "circle") {
    drawStarGeometry({
      ctx,
      toPxInto,
      scratchPoint,
      pixelsPerUnit,
      starDiskCache,
      params: secondaryStarParamsScratch,
      x: geometry.center.x,
      y: geometry.center.y,
      r: geometry.radius,
      z: geometry.center.z,
      variant: "secondary",
      resolveSecondaryStarParams,
    });
    return;
  }
  if (geometry.kind === "circle") {
    drawBodyWithOcclusionHint({
      ctx,
      toPxInto,
      scratchPoint,
      pixelsPerUnit,
      x: geometry.center.x,
      y: geometry.center.y,
      rBody: geometry.radius,
      zBody: geometry.center.z,
      rStar,
      baseColor: bodyColor(geometry.body),
    });
    return;
  }
  if (geometry.kind === "ellipse") {
    drawEllipseBodyWithOcclusionHint({
      ctx,
      toPxInto,
      scratchPoint,
      pixelsPerUnit,
      x: geometry.center.x,
      y: geometry.center.y,
      rx: geometry.rx,
      ry: geometry.ry,
      angle: geometry.angle,
      zBody: geometry.center.z,
      rStar,
      baseColor: bodyColor(geometry.body),
    });
    return;
  }
  drawRingAnnulus({
    ctx,
    toPxInto,
    scratchPoint,
    pixelsPerUnit,
    x: geometry.center.x,
    y: geometry.center.y,
    z: geometry.center.z,
    innerRadius: geometry.innerRadius,
    outerRadius: geometry.outerRadius,
    inclination: geometry.inclination,
    angle: geometry.angle,
    color: ringColor(geometry.body),
  });
}
