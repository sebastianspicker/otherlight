import type { SystemParams } from "../core/types";
import { clamp, toFinitePositiveOr } from "../core/units";

import type { AtmosphereHaloStyle, ScratchPoint, ToPxInto } from "./sceneTypes";

export function atmosphereHaloStyle(
  params: SystemParams,
  body: "planet" | "moon",
  bodyRadius: number,
): AtmosphereHaloStyle | null {
  const phot = params.star.photometry;

  const transmission = phot?.atmosphereTransmission;
  if (transmission?.enabled && (transmission.target ?? "planet") === body) {
    const coreRadius = Math.max(bodyRadius, toFinitePositiveOr(transmission.r0, bodyRadius));
    const transmissionH = transmission.H;
    const scaleHeight = Math.max(
      0,
      typeof transmissionH === "number" && Number.isFinite(transmissionH) ? transmissionH : 0,
    );
    const tau0 = clamp(Number(transmission.tau0 ?? 0.25), 0, 4);
    const haloWidth =
      transmission.kind === "exponential-halo"
        ? Math.max(scaleHeight * 4, bodyRadius * 0.08)
        : Math.max(coreRadius - bodyRadius, bodyRadius * 0.03);
    const outerRadius = coreRadius + haloWidth;

    if (outerRadius > bodyRadius * 1.001) {
      return {
        outerRadius,
        alphaScale: clamp(0.12 + tau0 * 0.08, 0.12, 0.4),
        innerColor: body === "planet" ? "rgba(120, 210, 255, 0.48)" : "rgba(220, 232, 255, 0.38)",
        outerColor: body === "planet" ? "rgba(120, 210, 255, 0)" : "rgba(220, 232, 255, 0)",
      };
    }
  }

  const rt = phot?.atmosphereRT;
  if (rt?.enabled && (rt.target ?? "planet") === body) {
    let outerRadius = bodyRadius;
    let opacity = 0;
    for (const layer of rt.layers ?? []) {
      const r0 = toFinitePositiveOr(layer.r0, bodyRadius);
      const layerH = layer.H;
      const layerTau0 = layer.tau0;
      const layerCloudOpacity = layer.cloudOpacity;
      const scaleHeight = Math.max(0, typeof layerH === "number" && Number.isFinite(layerH) ? layerH : 0);
      const tau0 = Math.max(0, typeof layerTau0 === "number" && Number.isFinite(layerTau0) ? layerTau0 : 0);
      const cloudOpacity = Math.max(
        0,
        typeof layerCloudOpacity === "number" && Number.isFinite(layerCloudOpacity) ? layerCloudOpacity : 0,
      );
      outerRadius = Math.max(
        outerRadius,
        Math.max(bodyRadius, r0) + Math.max(scaleHeight * 4, bodyRadius * 0.02),
      );
      opacity = Math.max(opacity, tau0 + cloudOpacity);
    }

    if (outerRadius > bodyRadius * 1.001) {
      return {
        outerRadius,
        alphaScale: clamp(0.14 + opacity * 0.06, 0.14, 0.42),
        innerColor: body === "planet" ? "rgba(158, 224, 255, 0.52)" : "rgba(232, 240, 255, 0.40)",
        outerColor: body === "planet" ? "rgba(158, 224, 255, 0)" : "rgba(232, 240, 255, 0)",
      };
    }
  }

  return null;
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
