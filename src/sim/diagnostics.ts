/** Derives simulation diagnostics separately from physical state evolution. */

import type { SkyPoint, SystemParams } from "../core/types";
import { toFiniteNumber } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { impactParameterFromProjectedSky, tdvRatioFromSkyPlaneSpeeds } from "../physics/exomoonTiming";
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
  assertExoDiagnosticsInputs(params, t);

  const exo = getExomoonConfig(params);
  const impacts = computeImpactDiagnostics(params, kin);
  const sampledNow = sampleDiagnosticsNow(params, t, observerDir, kin, exo?.velDt);
  const sampledRef = sampleDiagnosticsReference(params, observerDir, exo);
  const vPlanetSky = skyPlaneSpeed(sampledNow.planet.v, observerDir);
  const vPlanetSkyRef = sampledRef ? skyPlaneSpeed(sampledRef.planet.v, observerDir) : undefined;

  return {
    vPlanetSky,
    vPlanetSkyRef,
    tdvRatio: finiteTdvRatio(vPlanetSkyRef, vPlanetSky),
    ...impacts,
  };
}

function assertExoDiagnosticsInputs(params: SystemParams, t: number): void {
  if (!Number.isFinite(t)) throw new Error("computeExoDiagnostics: t must be finite.");
  if (!params.star || !Number.isFinite(params.star.r) || params.star.r <= 0) {
    throw new Error("computeExoDiagnostics: star.r must be > 0");
  }
}

function computeImpactDiagnostics(
  params: SystemParams,
  kin: BodyKinematics,
): Pick<ExoDiagnostics, "bPlanet" | "bMoon"> {
  return {
    bPlanet: finiteImpactParameter(kin.planetSky, params.star.r),
    bMoon: kin.moonSky ? finiteImpactParameter(kin.moonSky, params.star.r) : undefined,
  };
}

function finiteImpactParameter(sky: SkyPoint, starRadius: number): number | undefined {
  const impact = impactParameterFromProjectedSky(sky, starRadius);
  return Number.isFinite(impact) ? impact : undefined;
}

function sampleDiagnosticsNow(
  params: SystemParams,
  t: number,
  observerDir: Vec3,
  kin: BodyKinematics,
  velDtSec: number | undefined,
): ReturnType<typeof sampleSystemState> {
  return sampleSystemState({
    system: params,
    tObs: t,
    observerDir,
    kinAtT: kin,
    velDtSec,
  });
}

function sampleDiagnosticsReference(
  params: SystemParams,
  observerDir: Vec3,
  exo: ReturnType<typeof getExomoonConfig>,
): ReturnType<typeof sampleSystemState> | undefined {
  // Skip the expensive reference-epoch sample only when exomoon timing is
  // completely absent (no config object at all). When the config exists but
  // is disabled, still compute diagnostics so they remain available in the UI.
  if (!exo) return undefined;

  return sampleSystemState({
    system: params,
    tObs: toFiniteNumber(exo.tRef, 0),
    observerDir,
    velDtSec: exo.velDt,
  });
}

function skyPlaneSpeed(v: Vec3, observerDir: Vec3): number | undefined {
  const vSky = projectToSky(v, observerDir);
  const speed = Math.hypot(vSky.x, vSky.y);
  return Number.isFinite(speed) ? speed : undefined;
}

function finiteTdvRatio(
  vPlanetSkyRef: number | undefined,
  vPlanetSky: number | undefined,
): number | undefined {
  if (vPlanetSkyRef === undefined || vPlanetSky === undefined) return undefined;

  const ratio = tdvRatioFromSkyPlaneSpeeds(vPlanetSkyRef, vPlanetSky);
  return Number.isFinite(ratio) ? ratio : undefined;
}
