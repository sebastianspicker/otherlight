/**
 * Owns scene Atmosphere Rings support within the render layer. Keeps visual projection and drawing concerns out of simulation state.
 */
import type { BrowserScenarioDraft } from "../../domain/model/types";
import type {
  AtmosphereRTLayer,
  AtmosphereRTParams,
  AtmosphereTransmissionParams,
} from "../../domain/model/typesPhotometryAtmosphere";
import { clamp, toFinitePositiveOr } from "../../domain/model/units";

import type { AtmosphereHaloStyle, ScratchPoint, ToPxInto } from "./sceneTypes";

type AtmosphereBody = "planet" | "moon";

export function atmosphereHaloStyle(
  params: BrowserScenarioDraft,
  body: AtmosphereBody,
  bodyRadius: number,
): AtmosphereHaloStyle | null {
  const phot = params.star.photometry;
  return (
    transmissionHaloStyle(phot?.atmosphereTransmission, body, bodyRadius) ??
    radiativeTransferHaloStyle(phot?.atmosphereRT, body, bodyRadius)
  );
}

function transmissionHaloStyle(
  transmission: AtmosphereTransmissionParams | undefined,
  body: AtmosphereBody,
  bodyRadius: number,
): AtmosphereHaloStyle | null {
  if (!matchesAtmosphereTarget(transmission, body)) return null;

  const coreRadius = Math.max(bodyRadius, toFinitePositiveOr(transmission.r0, bodyRadius));
  const haloWidth = transmissionHaloWidth(transmission, bodyRadius, coreRadius);
  const outerRadius = coreRadius + haloWidth;
  if (!hasVisibleHalo(outerRadius, bodyRadius)) return null;

  return buildHaloStyle({
    outerRadius,
    alphaScale: clamp(0.12 + clamp(Number(transmission.tau0 ?? 0.25), 0, 4) * 0.08, 0.12, 0.4),
    colors: haloColors(body, "transmission"),
  });
}

function radiativeTransferHaloStyle(
  rt: AtmosphereRTParams | undefined,
  body: AtmosphereBody,
  bodyRadius: number,
): AtmosphereHaloStyle | null {
  if (!matchesAtmosphereTarget(rt, body)) return null;

  const extent = radiativeTransferExtent(rt.layers ?? [], bodyRadius);
  if (!hasVisibleHalo(extent.outerRadius, bodyRadius)) return null;

  return buildHaloStyle({
    outerRadius: extent.outerRadius,
    alphaScale: clamp(0.14 + extent.opacity * 0.06, 0.14, 0.42),
    colors: haloColors(body, "radiative-transfer"),
  });
}

function matchesAtmosphereTarget(
  config: { enabled?: boolean; target?: AtmosphereBody } | undefined,
  body: AtmosphereBody,
): config is { enabled?: boolean; target?: AtmosphereBody } {
  return Boolean(config?.enabled && (config.target ?? "planet") === body);
}

function transmissionHaloWidth(
  transmission: AtmosphereTransmissionParams,
  bodyRadius: number,
  coreRadius: number,
): number {
  if (transmission.kind === "exponential-halo") {
    return Math.max(finiteNonNegative(transmission.H) * 4, bodyRadius * 0.08);
  }
  return Math.max(coreRadius - bodyRadius, bodyRadius * 0.03);
}

function radiativeTransferExtent(
  layers: AtmosphereRTLayer[],
  bodyRadius: number,
): { outerRadius: number; opacity: number } {
  let outerRadius = bodyRadius;
  let opacity = 0;
  for (const layer of layers) {
    const metrics = radiativeTransferLayerMetrics(layer, bodyRadius);
    outerRadius = Math.max(outerRadius, metrics.outerRadius);
    opacity = Math.max(opacity, metrics.opacity);
  }
  return { outerRadius, opacity };
}

function radiativeTransferLayerMetrics(
  layer: AtmosphereRTLayer,
  bodyRadius: number,
): { outerRadius: number; opacity: number } {
  const r0 = toFinitePositiveOr(layer.r0, bodyRadius);
  return {
    outerRadius: Math.max(bodyRadius, r0) + Math.max(finiteNonNegative(layer.H) * 4, bodyRadius * 0.02),
    opacity: finiteNonNegative(layer.tau0) + finiteNonNegative(layer.cloudOpacity),
  };
}

function finiteNonNegative(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function hasVisibleHalo(outerRadius: number, bodyRadius: number): boolean {
  return outerRadius > bodyRadius * 1.001;
}

function buildHaloStyle(args: {
  outerRadius: number;
  alphaScale: number;
  colors: { innerColor: string; outerColor: string };
}): AtmosphereHaloStyle {
  return {
    outerRadius: args.outerRadius,
    alphaScale: args.alphaScale,
    innerColor: args.colors.innerColor,
    outerColor: args.colors.outerColor,
  };
}

function haloColors(
  body: AtmosphereBody,
  mode: "transmission" | "radiative-transfer",
): { innerColor: string; outerColor: string } {
  if (mode === "transmission") {
    return body === "planet"
      ? { innerColor: "rgba(120, 210, 255, 0.48)", outerColor: "rgba(120, 210, 255, 0)" }
      : { innerColor: "rgba(220, 232, 255, 0.38)", outerColor: "rgba(220, 232, 255, 0)" };
  }
  return body === "planet"
    ? { innerColor: "rgba(158, 224, 255, 0.52)", outerColor: "rgba(158, 224, 255, 0)" }
    : { innerColor: "rgba(232, 240, 255, 0.40)", outerColor: "rgba(232, 240, 255, 0)" };
}

export function drawAtmosphereHalo(args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  pixelsPerUnit: number;
  x: number;
  y: number;
  innerRadius: number;
  outerRadius: number;
  zBody: number;
  innerColor: string;
  outerColor: string;
  alphaScale: number;
}): void {
  const { ctx, toPxInto, scratchPoint, pixelsPerUnit, x, y, innerRadius, outerRadius, zBody } = args;
  const p = toPxInto(x, y, scratchPoint);
  const innerPx = toFinitePositiveOr(innerRadius, 1e-6) * pixelsPerUnit;
  const outerPx = toFinitePositiveOr(outerRadius, innerRadius) * pixelsPerUnit;
  if (!(outerPx > innerPx)) return;

  const depthFade = clamp(0.35 + 0.65 * (1 / (1 + Math.abs(zBody) * 0.002)), 0.25, 1);

  ctx.save();
  ctx.globalAlpha = clamp(args.alphaScale * depthFade, 0.08, 0.75);
  const gradient = ctx.createRadialGradient(p.x, p.y, innerPx, p.x, p.y, outerPx);
  gradient.addColorStop(0, args.innerColor);
  gradient.addColorStop(Math.max(0.08, innerPx / outerPx), args.innerColor);
  gradient.addColorStop(1, args.outerColor);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(p.x, p.y, outerPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawRingAnnulus(args: {
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
  const shade = clamp(0.25 + 0.7 * (1 / (1 + Math.abs(z) * 0.002)), 0.2, 1);

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

export function ringColor(body: "planet" | "moon" | "star"): string {
  if (body === "star") return "rgba(245, 176, 76, 0.28)";
  return body === "planet" ? "rgba(120, 210, 255, 0.38)" : "rgba(205, 212, 220, 0.32)";
}
