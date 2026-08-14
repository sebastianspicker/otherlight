/**
 * Owns system State support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import type { SystemParams } from "../core/types";
import { G_SI, isFinitePositive, normalizeFiniteDiffDtSec } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { VEC3ZERO, vSub } from "../physics/vec3";
import { projectToSky } from "../physics/frames";
import { computeBodyKinematics, type BodyKinematics } from "./kinematics";
import { assertTimeObserverContract } from "./observerContract";
import { getNBodyStateAt, isNBodyEnabled } from "./dynamics";
import { normalizeRelativityParams, solveLightTimeCorrectedResult } from "../physics/relativity";
import { canUseDirectKeplerState, resolveDirectKeplerSystemState } from "./systemStateDirectKepler";
import {
  estimateStarReflexFromMassClosure,
  sanitizeDynamicVelocities,
  type DynamicBodyState,
  type DynamicSystemState,
} from "./systemStateTypes";

// Dynamic state resolver used by observables and timing diagnostics.
//
// Priority order:
// 1. sampled N-body state when the planet-moon integrator is enabled;
// 2. direct Kepler/exomoon-timing state when the orbit model is analytic enough;
// 3. finite-difference velocities from the kinematic sampler as a conservative fallback.
//
// Body positions are returned relative to the star where downstream transit and
// sky-projection code expects relative geometry. The star state is kept too
// because RV/astrometry diagnostics need the reflex motion.
export type { DynamicBodyState, DynamicSystemState } from "./systemStateTypes";
type DynamicResolveContext = {
  system: SystemParams;
  tObs: number;
  observerDir: Vec3;
  kinAtT: BodyKinematics;
  dt: number;
  rel: ReturnType<typeof normalizeRelativityParams>;
};
type NBodySample = NonNullable<ReturnType<typeof getNBodyStateAt>>;
type NBodySampleAt = (time: number) => NBodySample;
type LightTimeShapiroConfig = NonNullable<Parameters<typeof solveLightTimeCorrectedResult>[0]["shapiro"]>;

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

function resolveNBodyDynamicSystemState(
  context: DynamicResolveContext,
  nbodySample: NBodySample,
): DynamicSystemState {
  const { system, tObs, observerDir } = context;
  const sampleAt = nBodySampleAt(system, nbodySample);
  const shapiroSolve = resolveNBodyShapiroSolve(context, sampleAt);
  const tPlanet = solveNBodyEmissionTime(
    context,
    shapiroSolve,
    (time) => nBodyPlanetAt(sampleAt, observerDir, time).r,
  );
  const tMoon = system.moon
    ? solveNBodyEmissionTime(context, shapiroSolve, (time) => nBodyMoonAt(sampleAt, observerDir, time).r)
    : tObs;
  const tStar = solveNBodyEmissionTime(
    context,
    shapiroSolve,
    (time) => nBodyStarAt(sampleAt, observerDir, time).r,
  );

  const planet = nBodyPlanetAt(sampleAt, observerDir, tPlanet);
  const moon: DynamicBodyState | undefined = system.moon
    ? nBodyMoonAt(sampleAt, observerDir, tMoon)
    : undefined;
  const star = nBodyStarAt(sampleAt, observerDir, tStar);

  sanitizeDynamicVelocities(planet, moon, star);

  return { tObs, observerDir, planet, moon, star };
}

function nBodySampleAt(system: SystemParams, initialSample: NBodySample): NBodySampleAt {
  return (time) => getNBodyStateAt(system, time) ?? initialSample;
}

function nBodyPlanetAt(sampleAt: NBodySampleAt, observerDir: Vec3, time: number): DynamicBodyState {
  const sample = sampleAt(time);
  const r = vSub(sample.state.rP, sample.state.rS);
  return { r, v: vSub(sample.state.vP, sample.state.vS), sky: projectToSky(r, observerDir) };
}

function nBodyMoonAt(sampleAt: NBodySampleAt, observerDir: Vec3, time: number): DynamicBodyState {
  const sample = sampleAt(time);
  const r = vSub(sample.state.rM, sample.state.rS);
  return { r, v: vSub(sample.state.vM, sample.state.vS), sky: projectToSky(r, observerDir) };
}

function nBodyStarAt(sampleAt: NBodySampleAt, observerDir: Vec3, time: number): DynamicBodyState {
  const sample = sampleAt(time);
  return {
    r: sample.state.rS,
    v: sample.state.vS,
    sky: projectToSky(sample.state.rS, observerDir),
  };
}

function resolveNBodyShapiroSolve(
  context: DynamicResolveContext,
  sampleAt: NBodySampleAt,
): LightTimeShapiroConfig | undefined {
  const { system, rel } = context;
  if (!(rel.enabled && rel.shapiro)) return undefined;

  const muStarRel = nBodyRelativityMuStar(system);
  if (system.dynamics?.relativityLevel === "enhanced") {
    return {
      enabled: true,
      minImpact: rel.shapiroMinImpact,
      massesAtTime: (time) => nBodyShapiroMassesAtTime(system, sampleAt, muStarRel, time),
    };
  }

  if (!isFinitePositive(muStarRel)) return undefined;
  return {
    enabled: true,
    mu: muStarRel,
    minImpact: rel.shapiroMinImpact,
  };
}

function nBodyRelativityMuStar(system: SystemParams): number | undefined {
  const nbodyMuStar = system.dynamics?.nbodyPlanetMoon?.muStar;
  if (isFinitePositive(nbodyMuStar)) return nbodyMuStar;
  return isFinitePositive(system.star.m) ? G_SI * system.star.m : undefined;
}

function nBodyShapiroMassesAtTime(
  system: SystemParams,
  sampleAt: NBodySampleAt,
  muStarRel: number | undefined,
  time: number,
): Array<{ mu: number; r: Vec3 }> {
  const sample = sampleAt(time);
  const masses: Array<{ mu: number; r: Vec3 }> = [];

  if (isFinitePositive(muStarRel)) masses.push({ mu: muStarRel, r: VEC3ZERO });
  if (isFinitePositive(system.planet.m)) {
    masses.push({ mu: G_SI * system.planet.m, r: vSub(sample.state.rP, sample.state.rS) });
  }
  if (isFinitePositive(system.moon?.m)) {
    masses.push({ mu: G_SI * system.moon.m, r: vSub(sample.state.rM, sample.state.rS) });
  }

  return masses;
}

function solveNBodyEmissionTime(
  context: DynamicResolveContext,
  shapiroSolve: LightTimeShapiroConfig | undefined,
  rAtTime: (time: number) => Vec3,
): number {
  const { tObs, observerDir, rel } = context;
  // N-body samples are stored on the observer-time grid. When LTTE is active,
  // solve each body's emission time before re-sampling retarded positions.
  if (!(rel.enabled && rel.ltte)) return tObs;

  return solveLightTimeCorrectedResult({
    tObs,
    rAtTime,
    observerDir,
    c: rel.c,
    shapiro: shapiroSolve,
    maxIters: rel.ltteIters,
    tolSec: rel.ltteTolSec,
  }).tEmit;
}

function resolveFiniteDifferenceDynamicSystemState(context: DynamicResolveContext): DynamicSystemState {
  const { system, tObs, observerDir, kinAtT, dt } = context;
  const kinAt = (time: number) => computeBodyKinematics(system, time, observerDir);
  const planet = finiteDifferencePlanetState(kinAtT, tObs, dt, (time) => kinAt(time).rPlanetAbs);
  const moon = finiteDifferenceMoonState(
    kinAtT,
    observerDir,
    tObs,
    dt,
    (time) => kinAt(time).rMoonAbs ?? VEC3ZERO,
  );
  const star = finiteDifferenceStarState(system, observerDir, planet, moon);

  sanitizeDynamicVelocities(planet, moon, star);

  return { tObs, observerDir, planet, moon, star };
}

function finiteDifferencePlanetState(
  kinAtT: BodyKinematics,
  tObs: number,
  dt: number,
  positionAt: (time: number) => Vec3,
): DynamicBodyState {
  return {
    r: kinAtT.rPlanetAbs,
    v: finiteDiffVelocity(positionAt, tObs, dt, true),
    sky: kinAtT.planetSky,
  };
}

function finiteDifferenceMoonState(
  kinAtT: BodyKinematics,
  observerDir: Vec3,
  tObs: number,
  dt: number,
  positionAt: (time: number) => Vec3,
): DynamicBodyState | undefined {
  if (!kinAtT.rMoonAbs) return undefined;

  return {
    r: kinAtT.rMoonAbs,
    v: finiteDiffVelocity(positionAt, tObs, dt, true),
    sky: kinAtT.moonSky ?? projectToSky(kinAtT.rMoonAbs, observerDir),
  };
}

function finiteDifferenceStarState(
  system: SystemParams,
  observerDir: Vec3,
  planet: DynamicBodyState,
  moon?: DynamicBodyState,
): DynamicBodyState {
  const starReflex = estimateStarReflexFromMassClosure(system, planet, moon);
  return {
    r: starReflex.r,
    v: starReflex.v,
    sky: projectToSky(starReflex.r, observerDir),
  };
}

export function resolveDynamicSystemState(params: {
  system: SystemParams;
  tObs: number;
  observerDir: Vec3;
  kinAtT?: BodyKinematics;
  velDtSec?: number;
}): DynamicSystemState {
  const { system, tObs, observerDir } = params;
  assertTimeObserverContract({ system, tObs, observerDir });
  const kinAtT = params.kinAtT ?? computeBodyKinematics(system, tObs, observerDir);
  const dt = normalizeFiniteDiffDtSec(params.velDtSec, 2);
  const rel = normalizeRelativityParams(system.dynamics?.relativity);
  const context: DynamicResolveContext = { system, tObs, observerDir, kinAtT, dt, rel };
  const nbodySample = isNBodyEnabled(system) ? getNBodyStateAt(system, tObs) : null;

  if (nbodySample) {
    return resolveNBodyDynamicSystemState(context, nbodySample);
  }

  if (canUseDirectKeplerState(system)) {
    const direct = resolveDirectKeplerSystemState({ system, tObs, observerDir, kinAtT });
    if (direct) return direct;
  }

  return resolveFiniteDifferenceDynamicSystemState(context);
}
