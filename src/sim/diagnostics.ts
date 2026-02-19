// src/sim/diagnostics.ts

import type { SystemParams } from "../core/types";
import { toFiniteNumber } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { impactParameterFromSkyY, tdvRatioFromSkyPlaneSpeeds } from "../physics/exomoonTiming";
import { projectToSky } from "../physics/frames";
import type { BodyKinematics } from "./kinematics";
import { getExomoonConfig } from "./kinematics";
import { sampleSystemState } from "./stateSampler";

export type ExoDiagnostics = {
  vPlanetSky?: number;
  vPlanetSkyRef?: number;
  tdvRatio?: number;
  bPlanet?: number;
  bMoon?: number;
};

export function computeExoDiagnostics(
  params: SystemParams,
  t: number,
  observerDir: Vec3,
  kin: BodyKinematics,
): ExoDiagnostics {
  if (!Number.isFinite(t)) throw new Error("computeExoDiagnostics: t must be finite.");
  if (!params.star || !Number.isFinite(params.star.r) || params.star.r <= 0) {
    throw new Error("computeExoDiagnostics: star.r must be > 0");
  }

  const exo = getExomoonConfig(params);
  const exoEnabled = Boolean(exo?.enabled);

  // Impact parameters are geometry diagnostics: always provide them.
  const bPlanet = impactParameterFromSkyY(kin.planetSky.y, params.star.r);
  const bMoon = kin.moonSky ? impactParameterFromSkyY(kin.moonSky.y, params.star.r) : undefined;
  if (!exoEnabled) return { bPlanet, bMoon };

  const tRef = toFiniteNumber(exo?.tRef, 0);
  const sampledNow = sampleSystemState({
    system: params,
    tObs: t,
    observerDir,
    kinAtT: kin,
    velDtSec: exo?.velDt,
  });
  const sampledRef = sampleSystemState({
    system: params,
    tObs: tRef,
    observerDir,
    velDtSec: exo?.velDt,
  });

  const vNowSky = projectToSky(sampledNow.planet.v, observerDir);
  const vRefSky = projectToSky(sampledRef.planet.v, observerDir);
  const vPlanetSkyRaw = Math.hypot(vNowSky.x, vNowSky.y);
  const vPlanetSkyRefRaw = Math.hypot(vRefSky.x, vRefSky.y);

  const vPlanetSky = Number.isFinite(vPlanetSkyRaw) ? vPlanetSkyRaw : undefined;
  const vPlanetSkyRef = Number.isFinite(vPlanetSkyRefRaw) ? vPlanetSkyRefRaw : undefined;

  let tdvRatio: number | undefined;
  if (vPlanetSkyRef !== undefined && vPlanetSky !== undefined) {
    const r = tdvRatioFromSkyPlaneSpeeds(vPlanetSkyRef, vPlanetSky);
    if (Number.isFinite(r)) tdvRatio = r;
  }

  return { vPlanetSky, vPlanetSkyRef, tdvRatio, bPlanet, bMoon };
}
