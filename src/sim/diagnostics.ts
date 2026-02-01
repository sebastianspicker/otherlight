// src/sim/diagnostics.ts

import type { SystemParams } from "../core/types";
import { normalizeFiniteDiffDtSec, toFiniteNumber } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { vSub } from "../physics/vec3";
import { trySplitBarycentricPair } from "../physics/barycenter";
import {
  applyOrientationEvolution,
  estimateSkyPlaneSpeed,
  impactParameterFromSkyY,
  tdvRatioFromSkyPlaneSpeeds,
} from "../physics/exomoonTiming";
import type { BodyKinematics } from "./kinematics";
import { getExomoonConfig } from "./kinematics";
import { posFromElements, resolveOrbitElements } from "./orbits";
import { getNBodyStateAt, isNBodyEnabled } from "./dynamics";

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
  const nbodyActive = isNBodyEnabled(params);
  const exoEnabled = Boolean(exo?.enabled);

  // Impact parameters are geometry diagnostics: always provide them.
  const bPlanet = impactParameterFromSkyY(kin.planetSky.y, params.star.r);
  const bMoon = kin.moonSky ? impactParameterFromSkyY(kin.moonSky.y, params.star.r) : undefined;
  if (!exoEnabled) return { bPlanet, bMoon };

  const tRef = toFiniteNumber(exo?.tRef, 0);
  const velDt = normalizeFiniteDiffDtSec(exo?.velDt, 2.0);

  const planetAbsAt = (ti: number): Vec3 => {
    if (nbodyActive) {
      const nbody = getNBodyStateAt(params, ti);
      if (nbody) return vSub(nbody.state.rP, nbody.state.rS);
    }

    const rB = posFromElements(params.planet.orbit, ti, "planet.orbit");

    // If there is no moon, "planet orbit" is the planet orbit directly.
    if (!params.moon) return rB;

    // If there is a moon and masses are provided, "planet orbit" is interpreted as barycenter orbit.
    const moonOrbitBaseEl = resolveOrbitElements(params.moon.orbitAroundPlanet, ti, "moon.orbitAroundPlanet");
    const moonOrbitEvolvedEl = applyOrientationEvolution(moonOrbitBaseEl, ti, {
      enabled: true,
      tRef,
      OmegaDot: exo?.moonOmegaDot,
      incDot: exo?.moonIncDot,
      omegaDot: exo?.moonOmegaSmallDot,
      Omega0: exo?.moonOmega0,
      inc0: exo?.moonInc0,
      omega0: exo?.moonOmegaSmall0,
      wrapAngles: "2pi",
      clampInc01Pi: true,
    });

    const rRel = posFromElements(moonOrbitEvolvedEl, ti, "moon.orbitAroundPlanet");
    const split = trySplitBarycentricPair({
      rBary: rB,
      rRel, // vector from planet to moon
      mPrimary: params.planet.m,
      mSecondary: params.moon.m,
    });

    return split ? split.rPrimary : rB;
  };

  const vPlanetSkyRaw = estimateSkyPlaneSpeed(planetAbsAt, t, observerDir, { dtSec: velDt, central: true });
  const vPlanetSkyRefRaw = estimateSkyPlaneSpeed(planetAbsAt, tRef, observerDir, {
    dtSec: velDt,
    central: true,
  });

  const vPlanetSky = Number.isFinite(vPlanetSkyRaw) ? vPlanetSkyRaw : undefined;
  const vPlanetSkyRef = Number.isFinite(vPlanetSkyRefRaw) ? vPlanetSkyRefRaw : undefined;

  let tdvRatio: number | undefined;
  if (vPlanetSkyRef !== undefined && vPlanetSky !== undefined) {
    const r = tdvRatioFromSkyPlaneSpeeds(vPlanetSkyRef, vPlanetSky);
    if (Number.isFinite(r)) tdvRatio = r;
  }

  return { vPlanetSky, vPlanetSkyRef, tdvRatio, bPlanet, bMoon };
}
