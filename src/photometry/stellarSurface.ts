import type { BrightnessPatch, StellarSurfaceParams } from "../core/types";

import type { Vec3 } from "../physics/vec3";
import { projectToSky } from "../physics/frames";

function sphericalToCartesian(r: number, lat: number, lon: number): Vec3 {
  const cl = Math.cos(lat);
  return {
    x: r * cl * Math.cos(lon),
    y: r * Math.sin(lat),
    z: r * cl * Math.sin(lon),
  };
}

type SurfaceProjectionContext = {
  t: number;
  tRef: number;
  observerDir: Vec3;
  rStar: number;
  baseOmega: number;
  differentialRotationK: number;
};

function shouldProjectSurfacePatches(
  model: StellarSurfaceParams | undefined,
  patches: BrightnessPatch[],
): model is StellarSurfaceParams {
  return Boolean(model?.enabled && model.useSurfacePatches && patches.length > 0);
}

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function boundedDifferentialRotationK(model: StellarSurfaceParams): number {
  return Math.max(0, Math.min(1, finiteOrDefault(model.differentialRotationK, 0)));
}

function rotationAngularSpeed(model: StellarSurfaceParams): number {
  return (2 * Math.PI) / Math.max(1, Number(model.rotationPeriodSec ?? 1));
}

function projectionContext(params: {
  t: number;
  tRef?: number;
  observerDir: Vec3;
  rStar: number;
  model: StellarSurfaceParams;
}): SurfaceProjectionContext {
  return {
    t: params.t,
    tRef: finiteOrDefault(params.tRef, 0),
    observerDir: params.observerDir,
    rStar: params.rStar,
    baseOmega: rotationAngularSpeed(params.model),
    differentialRotationK: boundedDifferentialRotationK(params.model),
  };
}

function isValidSurfacePatch(
  surface: BrightnessPatch["surface"],
): surface is NonNullable<BrightnessPatch["surface"]> {
  return Boolean(
    surface &&
    Number.isFinite(surface.lat) &&
    Number.isFinite(surface.lon) &&
    Number.isFinite(surface.angularRadius) &&
    surface.angularRadius > 0,
  );
}

function surfaceLongitudeAtTime(
  surface: NonNullable<BrightnessPatch["surface"]>,
  context: SurfaceProjectionContext,
): number {
  const latSin = Math.sin(surface.lat);
  const omegaLat = context.baseOmega * (1 - context.differentialRotationK * latSin * latSin);
  return surface.lon + omegaLat * (context.t - context.tRef);
}

function surfacePatchRadius(rStar: number, angularRadius: number): number {
  const boundedAngularRadius = Math.min(Math.PI / 2, Math.max(0, angularRadius));
  return Math.max(1e-9, rStar * Math.sin(boundedAngularRadius));
}

function projectSingleSurfacePatch(
  patch: BrightnessPatch,
  context: SurfaceProjectionContext,
): BrightnessPatch | undefined {
  if (!patch.surface) return patch;
  if (!isValidSurfacePatch(patch.surface)) return undefined;

  const lon = surfaceLongitudeAtTime(patch.surface, context);
  const center = sphericalToCartesian(context.rStar, patch.surface.lat, lon);
  const sky = projectToSky(center, context.observerDir);
  if (!(sky.z > 0)) return undefined;

  return {
    shape: "circle",
    x: sky.x,
    y: sky.y,
    r: surfacePatchRadius(context.rStar, patch.surface.angularRadius),
    factor: Math.max(0, patch.factor),
  };
}

export function projectSurfacePatchesToSky(params: {
  patches?: BrightnessPatch[];
  t: number;
  tRef?: number;
  observerDir: Vec3;
  rStar: number;
  model?: StellarSurfaceParams;
}): BrightnessPatch[] {
  const patches = Array.isArray(params.patches) ? params.patches : [];
  const model = params.model;
  if (!shouldProjectSurfacePatches(model, patches)) return patches;

  const context = projectionContext({ ...params, model });
  const out: BrightnessPatch[] = [];
  for (const patch of patches) {
    const projected = projectSingleSurfacePatch(patch, context);
    if (projected) out.push(projected);
  }

  return out;
}
