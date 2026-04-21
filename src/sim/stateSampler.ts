import type { SystemParams } from "../core/types";
import { G_SI } from "../core/units";
import { muFromPeriodAndA } from "../physics/kepler";
import {
  lightTimeDelaySec,
  normalizeRelativityParams,
  shapiroDelaySec,
  shapiroDelayMultiBodySec,
} from "../physics/relativity";
import type { Vec3 } from "../physics/vec3";
import { VEC3ZERO, vIsFinite } from "../physics/vec3";
import { computeBodyKinematics, type BodyKinematics } from "./kinematics";
import { assertTimeObserverContract } from "./observerContract";
import type { DynamicBodyState } from "./systemState";
import { resolveDynamicSystemState } from "./systemState";

export type SampledBodyState = DynamicBodyState & {
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
    // Fail-open: mu derivation from orbit elements failed; caller proceeds without star reflex correction.
    return undefined;
  }
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
  const dynamic = resolveDynamicSystemState({
    system,
    tObs,
    observerDir,
    kinAtT,
    velDtSec: params.velDtSec,
  });

  const planet: SampledBodyState = {
    ...dynamic.planet,
    ...sampleTimingTerms(system, kinAtT, observerDir, dynamic.planet.r),
  };

  const moon: SampledBodyState | undefined = dynamic.moon
    ? {
        ...dynamic.moon,
        ...sampleTimingTerms(system, kinAtT, observerDir, dynamic.moon.r),
      }
    : undefined;

  const star: SampledBodyState = dynamic.star;

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
