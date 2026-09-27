/** Builds cached radial gradient stops for the projected stellar disk. */
import type { LimbDarkeningLaw } from "../../../domain/model/types";
import { clamp, toFinitePositiveOr } from "../../../domain/model/units";
import { intensityNonNegative } from "../../../domain/simulation/limbDarkeningBridge";

export type Rgb = [number, number, number];
export type GradientStop = { pos: number; color: string };

export const parseHexColor = (hex: string, fallback: Rgb): Rgb => {
  if (typeof hex !== "string") return fallback;
  const value = hex.trim();
  if (!isSixDigitHexColor(value)) return fallback;
  const numeric = Number.parseInt(value.slice(1), 16);
  return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255];
};

export const rgbToCss = (rgb: Rgb): string => {
  const r = clamp(Math.round(rgb[0]), 0, 255);
  const g = clamp(Math.round(rgb[1]), 0, 255);
  const b = clamp(Math.round(rgb[2]), 0, 255);
  return `rgb(${r},${g},${b})`;
};

export const chooseStops = (radiusPx: number): number => {
  const count = Math.floor(radiusPx / 3);
  return Math.max(18, Math.min(72, count));
};

export const applyStopsToGradient = (
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  radiusPx: number,
  stops: GradientStop[],
): CanvasGradient => {
  const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radiusPx);
  for (const stop of stops) gradient.addColorStop(clamp(stop.pos, 0, 1), stop.color);
  return gradient;
};

export const buildLimbDarkeningStops = (params: {
  law: LimbDarkeningLaw;
  radiusPx: number;
  baseRgb: Rgb;
  gamma: number;
  maxDisplayIntensity: number;
  stopCount: number;
}): GradientStop[] => {
  const { law, baseRgb } = params;
  const stopCount = Math.max(8, Math.floor(params.stopCount));
  const centerIntensity = Math.max(1e-12, intensityNonNegative(1, law));
  const inverseCenterIntensity = 1 / centerIntensity;
  const gamma = toFinitePositiveOr(params.gamma, 2.2);
  const inverseGamma = 1 / gamma;
  const intensityMaximum = Math.max(0.05, toFinitePositiveOr(params.maxDisplayIntensity, 1.4));
  const stops: GradientStop[] = [];

  for (let index = 0; index <= stopCount; index += 1) {
    const radiusFraction = index / stopCount;
    const mu = Math.sqrt(Math.max(0, 1 - radiusFraction * radiusFraction));
    let intensity = intensityNonNegative(mu, law) * inverseCenterIntensity;
    intensity = clamp(intensity, 0, intensityMaximum);
    const brightness = Math.pow(intensity / intensityMaximum, inverseGamma);
    stops.push({ pos: radiusFraction, color: rgbToCss(mulRgb(baseRgb, 0.25 + 0.9 * brightness)) });
  }
  return stops;
};

export const buildDecorativeStops = (params: {
  baseRgb: Rgb;
  highlightRgb: Rgb;
  stopCount: number;
}): GradientStop[] => {
  const stopCount = Math.max(8, Math.floor(params.stopCount));
  const { baseRgb, highlightRgb } = params;
  const stops: GradientStop[] = [];
  for (let index = 0; index <= stopCount; index += 1) {
    const radiusFraction = index / stopCount;
    const blend = Math.pow(1 - radiusFraction, 0.65);
    stops.push({ pos: radiusFraction, color: rgbToCss(lerpRgb(baseRgb, highlightRgb, blend)) });
  }
  return stops;
};

export const lawKey = (law: LimbDarkeningLaw): string => {
  const quantize = (value: number) => (Number.isFinite(value) ? value.toFixed(10) : "NaN");
  switch (law.kind) {
    case "quadratic":
      return `quadratic|${quantize(law.u1)}|${quantize(law.u2)}`;
    case "three-parameter":
      return `three|${quantize(law.a1)}|${quantize(law.a2)}|${quantize(law.a3)}`;
    case "four-parameter":
      return `four|${quantize(law.a1)}|${quantize(law.a2)}|${quantize(law.a3)}|${quantize(law.a4)}`;
    default: {
      const neverLaw: never = law;
      return String(neverLaw);
    }
  }
};

const isSixDigitHexColor = (value: string): boolean => {
  if (value.length !== 7 || value.charCodeAt(0) !== 35) return false;
  for (let index = 1; index < value.length; index += 1) {
    if (!isAsciiHexDigit(value.charCodeAt(index))) return false;
  }
  return true;
};

const isAsciiHexDigit = (code: number): boolean => {
  const lowercase = code | 32;
  return (code >= 48 && code <= 57) || (lowercase >= 97 && lowercase <= 102);
};

const mulRgb = (rgb: Rgb, factor: number): Rgb => {
  const finiteFactor = Number.isFinite(factor) ? factor : 0;
  return [rgb[0] * finiteFactor, rgb[1] * finiteFactor, rgb[2] * finiteFactor];
};

const lerpRgb = (first: Rgb, second: Rgb, fraction: number): Rgb => {
  const t = clamp(fraction, 0, 1);
  return [
    first[0] * (1 - t) + second[0] * t,
    first[1] * (1 - t) + second[1] * t,
    first[2] * (1 - t) + second[2] * t,
  ];
};
