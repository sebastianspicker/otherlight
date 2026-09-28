/** Defines shared native V4 photometry types. */
import type { StarBodyV4 } from "./types";

export type WeightedPhotometryBand = { lambdaNm: number; weight: number; legacyTauScale: number };
export type PhotometricBody = {
  kind: "star" | "planet" | "moon";
  r: number;
  sky: { x: number; y: number; z: number };
};
export type VisibilityStar = PhotometricBody & { source: StarBodyV4 | unknown };
export type VisibilityOcculter = {
  r: number;
  sky: { x: number; y: number; z: number };
  opacity?: number;
  transmissionAtRadius?: (rho: number) => number;
};
