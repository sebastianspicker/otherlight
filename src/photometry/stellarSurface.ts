import type { BrightnessPatch, StellarSurfaceParams } from "../core/types";
import { clamp01 } from "../core/units";
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
  if (!model?.enabled || !model.useSurfacePatches || patches.length === 0) return patches;

  const t = params.t;
  const tRef = Number.isFinite(params.tRef) ? (params.tRef as number) : 0;
  const dt = t - tRef;
  const kDiff = Number.isFinite(model.differentialRotationK)
    ? Math.max(0, Math.min(1, model.differentialRotationK as number))
    : 0;
  const out: BrightnessPatch[] = [];

  for (const p of patches) {
    if (!p?.surface) {
      out.push(p);
      continue;
    }

    const lat = p.surface.lat;
    const lon0 = p.surface.lon;
    const angR = p.surface.angularRadius;
    if (!Number.isFinite(lat) || !Number.isFinite(lon0) || !Number.isFinite(angR) || angR <= 0) continue;

    const baseOmega = (2 * Math.PI) / Math.max(1, Number(model.rotationPeriodSec ?? 1));
    const omegaLat = baseOmega * (1 - kDiff * Math.sin(lat) * Math.sin(lat));
    const lon = lon0 + omegaLat * dt;

    const c = sphericalToCartesian(params.rStar, lat, lon);
    const sky = projectToSky(c, params.observerDir);

    if (!(sky.z > 0)) continue;

    const radius = Math.max(1e-9, params.rStar * Math.sin(Math.min(Math.PI / 2, Math.max(0, angR))));
    out.push({
      shape: "circle",
      x: sky.x,
      y: sky.y,
      r: radius,
      factor: clamp01(p.factor) === p.factor ? p.factor : Math.max(0, p.factor),
    });
  }

  return out;
}
