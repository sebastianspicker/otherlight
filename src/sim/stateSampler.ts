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

type RelativityConfig = ReturnType<typeof normalizeRelativityParams>;
type TimingTerms = { ltteSec?: number; shapiroSec?: number };
type ShapiroMass = { mu: number; r: Vec3 };
type ShapiroTimingInput = {
  params: SystemParams;
  kin: BodyKinematics;
  observerDir: Vec3;
  r: Vec3;
  rel: RelativityConfig;
};
type ShapiroDelayInput = ShapiroTimingInput & {
  muStar: number;
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
): TimingTerms {
  const rel = normalizeRelativityParams(params.dynamics?.relativity);
  if (!rel.enabled) return {};

  return {
    ...ltteTimingTerm(rel, r, observerDir),
    ...shapiroTimingTerm({ params, kin, observerDir, r, rel }),
  };
}

function ltteTimingTerm(rel: RelativityConfig, r: Vec3, observerDir: Vec3): TimingTerms {
  if (!rel.ltte) return {};

  const ltteSec = lightTimeDelaySec(r, observerDir, rel.c);
  return Number.isFinite(ltteSec) ? { ltteSec } : {};
}

function shapiroTimingTerm(input: ShapiroTimingInput): TimingTerms {
  const { params, kin, rel } = input;
  if (!rel.shapiro) return {};

  const muStar = resolveMuStar(params, kin);
  if (!Number.isFinite(muStar) || (muStar as number) <= 0) return {};

  const shapiroSec = shapiroDelayForLevel({ ...input, muStar: muStar as number });
  return Number.isFinite(shapiroSec) ? { shapiroSec } : {};
}

function shapiroDelayForLevel(input: ShapiroDelayInput): number {
  const { params, kin, observerDir, r, rel, muStar } = input;
  return (params.dynamics?.relativityLevel ?? "toy") === "enhanced"
    ? shapiroDelayMultiBodySec({
        rBody: r,
        observerDir,
        c: rel.c,
        minImpact: rel.shapiroMinImpact,
        masses: shapiroMasses(params, kin, muStar),
      })
    : shapiroDelaySec({
        r,
        observerDir,
        mu: muStar,
        c: rel.c,
        minImpact: rel.shapiroMinImpact,
      });
}

function shapiroMasses(params: SystemParams, kin: BodyKinematics, muStar: number): ShapiroMass[] {
  return [{ mu: muStar, r: VEC3ZERO }, planetShapiroMass(params, kin), moonShapiroMass(params, kin)].filter(
    isShapiroMass,
  );
}

function planetShapiroMass(params: SystemParams, kin: BodyKinematics): ShapiroMass | null {
  return Number.isFinite(params.planet?.m) && (params.planet!.m as number) > 0
    ? { mu: G_SI * (params.planet!.m as number), r: kin.rPlanetAbs }
    : null;
}

function moonShapiroMass(params: SystemParams, kin: BodyKinematics): ShapiroMass | null {
  return Number.isFinite(params.moon?.m) && (params.moon!.m as number) > 0 && kin.rMoonAbs
    ? { mu: G_SI * (params.moon!.m as number), r: kin.rMoonAbs }
    : null;
}

function isShapiroMass(mass: ShapiroMass | null): mass is ShapiroMass {
  return mass !== null;
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
