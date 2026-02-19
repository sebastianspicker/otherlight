import type { SkyPoint, SystemParams } from "../core/types";
import { G_SI, normalizeFiniteDiffDtSec } from "../core/units";
import { muFromPeriodAndA } from "../physics/kepler";
import {
  lightTimeDelaySec,
  normalizeRelativityParams,
  shapiroDelaySec,
  shapiroDelayMultiBodySec,
} from "../physics/relativity";
import type { Vec3 } from "../physics/vec3";
import { VEC3ZERO, vAdd, vIsFinite, vScale } from "../physics/vec3";
import { projectToSky } from "../physics/frames";
import { computeBodyKinematics, type BodyKinematics } from "./kinematics";
import { assertTimeObserverContract } from "./observerContract";

export type SampledBodyState = {
  r: Vec3;
  v: Vec3;
  sky: SkyPoint;
  ltteSec?: number;
  shapiroSec?: number;
};

export type SampledSystemState = {
  tObs: number;
  observerDir: Vec3;
  planet: SampledBodyState;
  moon?: SampledBodyState;
  star: SampledBodyState;
};

function finiteDiffVelocity(positionAt: (t: number) => Vec3, t: number, dt: number, central = true): Vec3 {
  const h = normalizeFiniteDiffDtSec(dt, 2);
  if (central) {
    const pMinus = positionAt(t - h);
    const pPlus = positionAt(t + h);
    return {
      x: (pPlus.x - pMinus.x) / (2 * h),
      y: (pPlus.y - pMinus.y) / (2 * h),
      z: (pPlus.z - pMinus.z) / (2 * h),
    };
  }

  const p0 = positionAt(t);
  const p1 = positionAt(t + h);
  return {
    x: (p1.x - p0.x) / h,
    y: (p1.y - p0.y) / h,
    z: (p1.z - p0.z) / h,
  };
}

function resolveMuStar(params: SystemParams, kin: BodyKinematics): number | undefined {
  const muNBody = params.dynamics?.nbodyPlanetMoon?.muStar;
  if (Number.isFinite(muNBody) && (muNBody as number) > 0) return muNBody as number;

  if (Number.isFinite(params.star?.m) && (params.star.m as number) > 0) {
    return G_SI * (params.star.m as number);
  }

  try {
    const mu = muFromPeriodAndA(kin.planetOrbit.period, kin.planetOrbit.a);
    return Number.isFinite(mu) && mu > 0 ? mu : undefined;
  } catch {
    return undefined;
  }
}

function estimateStarReflexFromMassClosure(
  params: SystemParams,
  planet: SampledBodyState,
  moon?: SampledBodyState,
) {
  const mS = params.star?.m;
  const mP = params.planet?.m;
  const mM = params.moon?.m;

  if (!(Number.isFinite(mS) && (mS as number) > 0)) {
    return { r: VEC3ZERO, v: VEC3ZERO };
  }

  const invMS = 1 / (mS as number);
  let r = VEC3ZERO;
  let v = VEC3ZERO;

  if (Number.isFinite(mP) && (mP as number) > 0) {
    r = vAdd(r, vScale(planet.r, -(mP as number) * invMS));
    v = vAdd(v, vScale(planet.v, -(mP as number) * invMS));
  }

  if (moon && Number.isFinite(mM) && (mM as number) > 0) {
    r = vAdd(r, vScale(moon.r, -(mM as number) * invMS));
    v = vAdd(v, vScale(moon.v, -(mM as number) * invMS));
  }

  return { r, v };
}

function sampleTimingTerms(
  params: SystemParams,
  kin: BodyKinematics,
  observerDir: Vec3,
  r: Vec3,
): { ltteSec?: number; shapiroSec?: number } {
  const rel = normalizeRelativityParams(params.dynamics?.relativity);
  if (!rel.enabled) return {};

  const out: { ltteSec?: number; shapiroSec?: number } = {};

  if (rel.ltte) {
    out.ltteSec = lightTimeDelaySec(r, observerDir, rel.c);
    if (!Number.isFinite(out.ltteSec)) out.ltteSec = undefined;
  }

  if (rel.shapiro) {
    const muStar = resolveMuStar(params, kin);
    if (Number.isFinite(muStar) && (muStar as number) > 0) {
      const relativityLevel = params.dynamics?.relativityLevel ?? "toy";
      const s =
        relativityLevel === "enhanced"
          ? shapiroDelayMultiBodySec({
              rBody: r,
              observerDir,
              c: rel.c,
              minImpact: rel.shapiroMinImpact,
              masses: [
                { mu: muStar as number, r: VEC3ZERO },
                Number.isFinite(params.planet?.m) && (params.planet!.m as number) > 0
                  ? { mu: G_SI * (params.planet!.m as number), r: kin.rPlanetAbs }
                  : null,
                Number.isFinite(params.moon?.m) && (params.moon!.m as number) > 0 && kin.rMoonAbs
                  ? { mu: G_SI * (params.moon!.m as number), r: kin.rMoonAbs }
                  : null,
              ].filter(Boolean) as Array<{ mu: number; r: Vec3 }>,
            })
          : shapiroDelaySec({
              r,
              observerDir,
              mu: muStar as number,
              c: rel.c,
              minImpact: rel.shapiroMinImpact,
            });
      out.shapiroSec = Number.isFinite(s) ? s : undefined;
    }
  }

  return out;
}

export function sampleSystemState(params: {
  system: SystemParams;
  tObs: number;
  observerDir: Vec3;
  kinAtT?: BodyKinematics;
  velDtSec?: number;
}): SampledSystemState {
  const { system, tObs, observerDir } = params;
  assertTimeObserverContract({ system, tObs, observerDir });
  const kinAtT = params.kinAtT ?? computeBodyKinematics(system, tObs, observerDir);
  const dt = normalizeFiniteDiffDtSec(params.velDtSec, 2);

  const kinAt = (t: number) => computeBodyKinematics(system, t, observerDir);

  const planetPosAt = (t: number) => kinAt(t).rPlanetAbs;
  const moonPosAt = (t: number) => kinAt(t).rMoonAbs ?? kinAt(t).rPlanetAbs;

  const planet: SampledBodyState = {
    r: kinAtT.rPlanetAbs,
    v: finiteDiffVelocity(planetPosAt, tObs, dt, true),
    sky: kinAtT.planetSky,
    ...sampleTimingTerms(system, kinAtT, observerDir, kinAtT.rPlanetAbs),
  };

  const moon: SampledBodyState | undefined = kinAtT.rMoonAbs
    ? {
        r: kinAtT.rMoonAbs,
        v: finiteDiffVelocity(moonPosAt, tObs, dt, true),
        sky: kinAtT.moonSky ?? projectToSky(kinAtT.rMoonAbs, observerDir),
        ...sampleTimingTerms(system, kinAtT, observerDir, kinAtT.rMoonAbs),
      }
    : undefined;

  const starReflex = estimateStarReflexFromMassClosure(system, planet, moon);
  const star: SampledBodyState = {
    r: starReflex.r,
    v: starReflex.v,
    sky: projectToSky(starReflex.r, observerDir),
  };

  if (!vIsFinite(planet.v)) planet.v = VEC3ZERO;
  if (moon && !vIsFinite(moon.v)) moon.v = VEC3ZERO;
  if (!vIsFinite(star.v)) star.v = VEC3ZERO;

  return {
    tObs,
    observerDir,
    planet,
    moon,
    star,
  };
}

export function radialVelocityFromState(v: Vec3, observerDir: Vec3): number {
  if (!vIsFinite(v) || !vIsFinite(observerDir)) return 0;
  const d = observerDir;
  const norm = Math.hypot(d.x, d.y, d.z);
  if (!(norm > 0)) return 0;
  return -((v.x * d.x + v.y * d.y + v.z * d.z) / norm);
}

export function lightTimeDelayFromState(r: Vec3, observerDir: Vec3, c: number): number {
  return lightTimeDelaySec(r, observerDir, c);
}
