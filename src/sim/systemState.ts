import type { ExomoonTimingShapeParams, OrbitElements, SkyPoint, SystemParams } from "../core/types";
import { G_SI, isFinitePositive, normalizeFiniteDiffDtSec } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { VEC3ZERO, vAdd, vAddScaled, vCross, vIsFinite, vScale, vSub } from "../physics/vec3";
import { buildSkyBasis, projectToSky } from "../physics/frames";
import {
  computeBodyKinematics,
  getExomoonConfig,
  resolveMoonOrbitForKinematics,
  resolvePlanetOrbitForKinematics,
  type BodyKinematics,
} from "./kinematics";
import { assertTimeObserverContract } from "./observerContract";
import { getNBodyStateAt, isNBodyEnabled } from "./dynamics";
import { trySplitBarycentricPair } from "../physics/barycenter";
import { stateFromResolvedElements } from "./orbits";
import { applyOrientationEvolution } from "../physics/exomoonTiming";
import {
  applyApsidalPrecession,
  normalizeRelativityParams,
  resolveGrPrecessionPerOrbit,
  solveLightTimeCorrectedResult,
  solveLightTimeCorrectedTime,
} from "../physics/relativity";
import { muFromPeriodAndA } from "../physics/kepler";

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
export type DynamicBodyState = {
  r: Vec3;
  v: Vec3;
  sky: SkyPoint;
};

export type DynamicSystemState = {
  tObs: number;
  observerDir: Vec3;
  planet: DynamicBodyState;
  moon?: DynamicBodyState;
  star: DynamicBodyState;
};

type PositionVelocity = Pick<DynamicBodyState, "r" | "v">;
type DirectPairState = {
  baryState: PositionVelocity;
  planet: PositionVelocity;
  moon?: PositionVelocity;
};
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

function estimateStarReflexFromMassClosure(
  params: SystemParams,
  planet: DynamicBodyState,
  moon?: DynamicBodyState,
): Pick<DynamicBodyState, "r" | "v"> {
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

function supportsDirectExomoonTiming(system: SystemParams): boolean {
  const exo = getExomoonConfig(system);
  if (!exo?.enabled) return false;
  return true;
}

function evolveMoonOrbitForExomoonTiming(
  system: SystemParams,
  time: number,
  base: OrbitElements,
): OrbitElements {
  const exo = getExomoonConfig(system);
  if (!exo?.enabled) return base;
  return applyOrientationEvolution(base, time, {
    enabled: true,
    tRef: exo.tRef,
    OmegaDot: exo.moonOmegaDot,
    incDot: exo.moonIncDot,
    omegaDot: exo.moonOmegaSmallDot,
    Omega0: exo.moonOmega0,
    inc0: exo.moonInc0,
    omega0: exo.moonOmegaSmall0,
    wrapAngles: "2pi",
    clampInc01Pi: true,
  });
}

function exomoonTimingAngularVelocity(system: SystemParams, evolvedMoonOrbit: OrbitElements): Vec3 {
  const exo = getExomoonConfig(system);
  if (!exo?.enabled) return VEC3ZERO;

  const omegaNodeDot = Number.isFinite(exo.moonOmegaDot) ? exo.moonOmegaDot! : 0;
  const incDot = Number.isFinite(exo.moonIncDot) ? exo.moonIncDot! : 0;
  const omegaPeriDot = Number.isFinite(exo.moonOmegaSmallDot) ? exo.moonOmegaSmallDot! : 0;

  if (omegaNodeDot === 0 && incDot === 0 && omegaPeriDot === 0) return VEC3ZERO;

  const nodeHat: Vec3 = {
    x: Math.cos(evolvedMoonOrbit.Omega),
    y: Math.sin(evolvedMoonOrbit.Omega),
    z: 0,
  };
  const hHat: Vec3 = {
    x: Math.sin(evolvedMoonOrbit.inc) * Math.sin(evolvedMoonOrbit.Omega),
    y: -Math.sin(evolvedMoonOrbit.inc) * Math.cos(evolvedMoonOrbit.Omega),
    z: Math.cos(evolvedMoonOrbit.inc),
  };

  return {
    x: incDot * nodeHat.x + omegaPeriDot * hHat.x,
    y: incDot * nodeHat.y + omegaPeriDot * hHat.y,
    z: omegaNodeDot + incDot * nodeHat.z + omegaPeriDot * hHat.z,
  };
}

function canUseDirectKeplerState(system: SystemParams): boolean {
  const exomoonEnabled = Boolean(system.dynamics?.exomoonTimingShape?.enabled);
  return !exomoonEnabled || supportsDirectExomoonTiming(system);
}

function resolveDirectKeplerSystemState(params: {
  system: SystemParams;
  tObs: number;
  observerDir: Vec3;
  kinAtT: BodyKinematics;
}): DynamicSystemState | undefined {
  const { system, tObs, observerDir, kinAtT } = params;
  const rel = normalizeRelativityParams(system.dynamics?.relativity);
  const exo = getExomoonConfig(system);
  const planetOrbitAt = (time: number) => {
    const planetOrbitBase = resolvePlanetOrbitForKinematics(system, time, "planet.orbit");
    return rel.enabled && rel.grPrecession
      ? applyApsidalPrecession(
          planetOrbitBase,
          time,
          resolveGrPrecessionPerOrbit({
            orbit: planetOrbitBase,
            c: rel.c,
            override: rel.planetPrecessionPerOrbit,
          }),
        )
      : planetOrbitBase;
  };
  const baryStateAt = (time: number) => {
    const planetOrbit = planetOrbitAt(time);
    const muStarSystem = muFromPeriodAndA(planetOrbit.period, planetOrbit.a);
    return stateFromResolvedElements(planetOrbit, time, muStarSystem, "planet.orbit");
  };
  const shapiroMuStar = (() => {
    if (!(rel.enabled && rel.shapiro)) return undefined;
    try {
      const baseMu = muFromPeriodAndA(planetOrbitAt(tObs).period, planetOrbitAt(tObs).a);
      return Number.isFinite(baseMu) && baseMu > 0 ? baseMu : undefined;
    } catch {
      return undefined;
    }
  })();
  const pairStateAt = (time: number) => {
    const baryState = baryStateAt(time);
    return directPairStateAt({
      system,
      time,
      observerDir,
      rel,
      exo,
      baryState,
    });
  };
  const shapiroSolve = (() => {
    const shapiroMu = shapiroMuStar;
    if (typeof shapiroMu !== "number" || !Number.isFinite(shapiroMu) || shapiroMu <= 0) return undefined;
    if (system.dynamics?.relativityLevel === "enhanced") {
      return {
        enabled: true as const,
        minImpact: rel.shapiroMinImpact,
        massesAtTime: (time: number) => {
          const pairState = pairStateAt(time);
          if (!pairState) return [];
          return [
            { mu: shapiroMu, r: { x: 0, y: 0, z: 0 } },
            Number.isFinite(system.planet.m) && system.planet.m! > 0
              ? { mu: G_SI * system.planet.m!, r: pairState.planet.r }
              : null,
            pairState.moon && Number.isFinite(system.moon?.m) && system.moon!.m! > 0
              ? { mu: G_SI * system.moon!.m!, r: pairState.moon.r }
              : null,
          ].filter(Boolean) as Array<{ mu: number; r: Vec3 }>;
        },
      };
    }
    return {
      enabled: true as const,
      mu: shapiroMu,
      minImpact: rel.shapiroMinImpact,
    };
  })();
  const tPlanet =
    rel.enabled && rel.ltte
      ? solveLightTimeCorrectedTime({
          tObs,
          rAtTime: (time) => pairStateAt(time)?.planet.r ?? baryStateAt(time).r,
          observerDir,
          c: rel.c,
          shapiro: shapiroSolve,
          maxIters: rel.ltteIters,
          tolSec: rel.ltteTolSec,
        })
      : tObs;
  const tMoon =
    rel.enabled && rel.ltte && system.moon
      ? solveLightTimeCorrectedTime({
          tObs,
          rAtTime: (time) => pairStateAt(time)?.moon?.r ?? pairStateAt(time)?.planet.r ?? baryStateAt(time).r,
          observerDir,
          c: rel.c,
          shapiro: shapiroSolve,
          maxIters: rel.ltteIters,
          tolSec: rel.ltteTolSec,
        })
      : tObs;
  const planetPairState = pairStateAt(tPlanet);
  if (!planetPairState) return undefined;
  const moonPairState = system.moon ? pairStateAt(tMoon) : undefined;
  if (system.moon && !moonPairState) return undefined;

  const planet: DynamicBodyState = {
    r: planetPairState.planet.r,
    v: planetPairState.planet.v,
    sky: kinAtT.planetSky,
  };
  const moon: DynamicBodyState | undefined =
    moonPairState?.moon &&
    ({
      r: moonPairState.moon.r,
      v: moonPairState.moon.v,
      sky: kinAtT.moonSky ?? projectToSky(moonPairState.moon.r, observerDir),
    } satisfies DynamicBodyState);

  const starReflex = estimateStarReflexFromMassClosure(system, planet, moon);
  const star: DynamicBodyState = {
    r: starReflex.r,
    v: starReflex.v,
    sky: projectToSky(starReflex.r, observerDir),
  };

  if (!vIsFinite(planet.v)) planet.v = VEC3ZERO;
  if (moon && !vIsFinite(moon.v)) moon.v = VEC3ZERO;
  if (!vIsFinite(star.v)) star.v = VEC3ZERO;

  return { tObs, observerDir, planet, moon, star };
}

function directPairStateAt(args: {
  system: SystemParams;
  time: number;
  observerDir: Vec3;
  rel: ReturnType<typeof normalizeRelativityParams>;
  exo: ExomoonTimingShapeParams | undefined;
  baryState: PositionVelocity;
}): DirectPairState | undefined {
  const { system, time, observerDir, rel, exo, baryState } = args;
  if (!system.moon) return { baryState, planet: baryState };

  const moonRelState = directMoonRelativeState(system, time, rel);
  if (!moonRelState) return undefined;

  return applyDirectMoonImpactDrift(
    splitDirectPlanetMoonState(system, baryState, moonRelState),
    exo,
    observerDir,
    time,
  );
}

function directMoonRelativeState(
  system: SystemParams,
  time: number,
  rel: ReturnType<typeof normalizeRelativityParams>,
): PositionVelocity | undefined {
  const moonOrbitBase = resolveMoonOrbitForKinematics(system, time, "moon.orbitAroundPlanet");
  if (!moonOrbitBase) return undefined;

  const moonOrbitEvolved = evolveMoonOrbitForExomoonTiming(system, time, moonOrbitBase);
  const moonOrbit = directMoonOrbitWithRelativity(moonOrbitEvolved, time, rel);
  const muPlanetMoon = muFromPeriodAndA(moonOrbit.period, moonOrbit.a);
  const moonRelStateBase = stateFromResolvedElements(moonOrbit, time, muPlanetMoon, "moon.orbitAroundPlanet");
  const orientationAngularVelocity = exomoonTimingAngularVelocity(system, moonOrbitEvolved);

  return {
    r: moonRelStateBase.r,
    v: vAdd(moonRelStateBase.v, vCross(orientationAngularVelocity, moonRelStateBase.r)),
  };
}

function directMoonOrbitWithRelativity(
  moonOrbitEvolved: OrbitElements,
  time: number,
  rel: ReturnType<typeof normalizeRelativityParams>,
): OrbitElements {
  if (!rel.enabled || !rel.grPrecession) return moonOrbitEvolved;

  return applyApsidalPrecession(
    moonOrbitEvolved,
    time,
    resolveGrPrecessionPerOrbit({
      orbit: moonOrbitEvolved,
      c: rel.c,
      override: rel.moonPrecessionPerOrbit,
    }),
  );
}

function splitDirectPlanetMoonState(
  system: SystemParams,
  baryState: PositionVelocity,
  moonRelState: PositionVelocity,
): DirectPairState {
  const split = trySplitBarycentricPair({
    rBary: baryState.r,
    rRel: moonRelState.r,
    mPrimary: system.planet.m,
    mSecondary: system.moon?.m,
  });

  if (!split) {
    return {
      baryState,
      planet: baryState,
      moon: {
        r: vAdd(baryState.r, moonRelState.r),
        v: vAdd(baryState.v, moonRelState.v),
      },
    };
  }

  return {
    baryState,
    planet: {
      r: split.rPrimary,
      v: vAddScaled(baryState.v, moonRelState.v, -split.muSecondary),
    },
    moon: {
      r: split.rSecondary,
      v: vAddScaled(baryState.v, moonRelState.v, split.muPrimary),
    },
  };
}

function applyDirectMoonImpactDrift(
  pairState: DirectPairState,
  exo: ExomoonTimingShapeParams | undefined,
  observerDir: Vec3,
  time: number,
): DirectPairState {
  if (!pairState.moon || !Number.isFinite(exo?.moonImpactYDot) || exo!.moonImpactYDot === 0) return pairState;

  const yDot = exo!.moonImpactYDot as number;
  const tRef = Number.isFinite(exo?.tRef) ? (exo!.tRef as number) : 0;
  const driftY = (time - tRef) * yDot;
  const { ey } = buildSkyBasis(observerDir);

  return {
    ...pairState,
    moon: {
      r: vAddScaled(pairState.moon.r, ey, driftY),
      v: vAddScaled(pairState.moon.v, ey, yDot),
    },
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

function sanitizeDynamicVelocities(
  planet: DynamicBodyState,
  moon: DynamicBodyState | undefined,
  star: DynamicBodyState,
) {
  if (!vIsFinite(planet.v)) planet.v = VEC3ZERO;
  if (moon && !vIsFinite(moon.v)) moon.v = VEC3ZERO;
  if (!vIsFinite(star.v)) star.v = VEC3ZERO;
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
