/** Resolves direct Kepler system states, including exomoon timing and relativity corrections. */
import type { ExomoonTimingShapeParams, OrbitElements, SystemParams } from "../core/types";
import { G_SI } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { VEC3ZERO, vAdd, vAddScaled, vCross } from "../physics/vec3";
import { trySplitBarycentricPair } from "../physics/barycenter";
import { applyOrientationEvolution } from "../physics/exomoonTiming";
import { buildSkyBasis, projectToSky } from "../physics/frames";
import { muFromPeriodAndA } from "../physics/kepler";
import {
  applyApsidalPrecession,
  normalizeRelativityParams,
  resolveGrPrecessionPerOrbit,
  solveLightTimeCorrectedTime,
} from "../physics/relativity";
import {
  getExomoonConfig,
  resolveMoonOrbitForKinematics,
  resolvePlanetOrbitForKinematics,
  type BodyKinematics,
} from "./kinematics";
import type { LightTimeShapiroConfig } from "./kinematicsShapiro";
import { stateFromResolvedElements } from "./orbits";
import {
  estimateStarReflexFromMassClosure,
  sanitizeDynamicVelocities,
  type DynamicBodyState,
  type DynamicSystemState,
} from "./systemStateTypes";

type PositionVelocity = Pick<DynamicBodyState, "r" | "v">;
type DirectPairState = {
  baryState: PositionVelocity;
  planet: PositionVelocity;
  moon?: PositionVelocity;
};
type DirectStateSampler = ReturnType<typeof createDirectKeplerStateSampler>;

export function canUseDirectKeplerState(system: SystemParams): boolean {
  const exomoonEnabled = Boolean(system.dynamics?.exomoonTimingShape?.enabled);
  return !exomoonEnabled || supportsDirectExomoonTiming(system);
}

export function resolveDirectKeplerSystemState(params: {
  system: SystemParams;
  tObs: number;
  observerDir: Vec3;
  kinAtT: BodyKinematics;
}): DynamicSystemState | undefined {
  const { system, tObs, observerDir, kinAtT } = params;
  const rel = normalizeRelativityParams(system.dynamics?.relativity);
  const exo = getExomoonConfig(system);
  const { planetOrbitAt, baryStateAt, pairStateAt } = createDirectKeplerStateSampler({
    system,
    observerDir,
    rel,
    exo,
  });
  const shapiroSolve = resolveDirectShapiroSolve({ system, tObs, rel, planetOrbitAt, pairStateAt });
  const { tPlanet, tMoon } = resolveDirectEmissionTimes({
    system,
    tObs,
    observerDir,
    rel,
    shapiroSolve,
    sampler: { baryStateAt, pairStateAt },
  });
  const pairStates = resolveDirectPairStates(system, pairStateAt, tPlanet, tMoon);
  if (!pairStates) return undefined;

  return buildDirectKeplerSystemState({
    system,
    tObs,
    observerDir,
    kinAtT,
    planetPairState: pairStates.planet,
    moonPairState: pairStates.moon,
  });
}

function supportsDirectExomoonTiming(system: SystemParams): boolean {
  return Boolean(getExomoonConfig(system)?.enabled);
}

function createDirectKeplerStateSampler(args: {
  system: SystemParams;
  observerDir: Vec3;
  rel: ReturnType<typeof normalizeRelativityParams>;
  exo: ExomoonTimingShapeParams | undefined;
}) {
  const { system, observerDir, rel, exo } = args;
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
  const pairStateAt = (time: number) =>
    directPairStateAt({
      system,
      time,
      observerDir,
      rel,
      exo,
      baryState: baryStateAt(time),
    });

  return { planetOrbitAt, baryStateAt, pairStateAt };
}

function resolveDirectShapiroSolve(args: {
  system: SystemParams;
  tObs: number;
  rel: ReturnType<typeof normalizeRelativityParams>;
  planetOrbitAt: (time: number) => OrbitElements;
  pairStateAt: (time: number) => DirectPairState | undefined;
}): LightTimeShapiroConfig | undefined {
  const { system, tObs, rel, planetOrbitAt, pairStateAt } = args;
  if (!(rel.enabled && rel.shapiro)) return undefined;

  const shapiroMu = resolveDirectShapiroMu(tObs, planetOrbitAt);
  if (typeof shapiroMu !== "number") return undefined;

  if (system.dynamics?.relativityLevel === "enhanced") {
    return enhancedDirectShapiroConfig(system, pairStateAt, shapiroMu, rel.shapiroMinImpact);
  }

  return { enabled: true, mu: shapiroMu, minImpact: rel.shapiroMinImpact };
}

function resolveDirectShapiroMu(
  tObs: number,
  planetOrbitAt: (time: number) => OrbitElements,
): number | undefined {
  try {
    const baseMu = muFromPeriodAndA(planetOrbitAt(tObs).period, planetOrbitAt(tObs).a);
    return Number.isFinite(baseMu) && baseMu > 0 ? baseMu : undefined;
  } catch {
    return undefined;
  }
}

function enhancedDirectShapiroConfig(
  system: SystemParams,
  pairStateAt: DirectStateSampler["pairStateAt"],
  shapiroMu: number,
  minImpact: number,
): LightTimeShapiroConfig {
  return {
    enabled: true,
    minImpact,
    massesAtTime: (time) => resolveDirectShapiroMassesAtTime(system, pairStateAt, shapiroMu, time),
  };
}

function resolveDirectShapiroMassesAtTime(
  system: SystemParams,
  pairStateAt: DirectStateSampler["pairStateAt"],
  shapiroMu: number,
  time: number,
): Array<{ mu: number; r: Vec3 }> {
  const pairState = pairStateAt(time);
  if (!pairState) return [];

  const masses = [{ mu: shapiroMu, r: { x: 0, y: 0, z: 0 } }];
  addDirectShapiroPlanetMass(masses, system, pairState);
  addDirectShapiroMoonMass(masses, system, pairState);
  return masses;
}

function addDirectShapiroPlanetMass(
  masses: Array<{ mu: number; r: Vec3 }>,
  system: SystemParams,
  pairState: DirectPairState,
): void {
  if (Number.isFinite(system.planet.m) && system.planet.m! > 0) {
    masses.push({ mu: G_SI * system.planet.m!, r: pairState.planet.r });
  }
}

function addDirectShapiroMoonMass(
  masses: Array<{ mu: number; r: Vec3 }>,
  system: SystemParams,
  pairState: DirectPairState,
): void {
  if (pairState.moon && Number.isFinite(system.moon?.m) && system.moon!.m! > 0) {
    masses.push({ mu: G_SI * system.moon!.m!, r: pairState.moon.r });
  }
}

function resolveDirectEmissionTimes(args: {
  system: SystemParams;
  tObs: number;
  observerDir: Vec3;
  rel: ReturnType<typeof normalizeRelativityParams>;
  shapiroSolve: LightTimeShapiroConfig | undefined;
  sampler: Pick<DirectStateSampler, "baryStateAt" | "pairStateAt">;
}): { tPlanet: number; tMoon: number } {
  const { system, tObs, observerDir, rel, shapiroSolve, sampler } = args;
  return {
    tPlanet: resolveDirectPlanetEmissionTime(tObs, observerDir, rel, shapiroSolve, sampler),
    tMoon: resolveDirectMoonEmissionTime(system, tObs, observerDir, rel, shapiroSolve, sampler),
  };
}

function resolveDirectPlanetEmissionTime(
  tObs: number,
  observerDir: Vec3,
  rel: ReturnType<typeof normalizeRelativityParams>,
  shapiroSolve: LightTimeShapiroConfig | undefined,
  sampler: Pick<DirectStateSampler, "baryStateAt" | "pairStateAt">,
): number {
  if (!(rel.enabled && rel.ltte)) return tObs;
  return resolveDirectEmissionTime({
    tObs,
    observerDir,
    rel,
    shapiroSolve,
    rAtTime: (time) => sampler.pairStateAt(time)?.planet.r ?? sampler.baryStateAt(time).r,
  });
}

function resolveDirectMoonEmissionTime(
  system: SystemParams,
  tObs: number,
  observerDir: Vec3,
  rel: ReturnType<typeof normalizeRelativityParams>,
  shapiroSolve: LightTimeShapiroConfig | undefined,
  sampler: Pick<DirectStateSampler, "baryStateAt" | "pairStateAt">,
): number {
  if (!(rel.enabled && rel.ltte && system.moon)) return tObs;
  return resolveDirectEmissionTime({
    tObs,
    observerDir,
    rel,
    shapiroSolve,
    rAtTime: (time) =>
      sampler.pairStateAt(time)?.moon?.r ??
      sampler.pairStateAt(time)?.planet.r ??
      sampler.baryStateAt(time).r,
  });
}

function resolveDirectPairStates(
  system: SystemParams,
  pairStateAt: DirectStateSampler["pairStateAt"],
  tPlanet: number,
  tMoon: number,
): { planet: DirectPairState; moon: DirectPairState | undefined } | undefined {
  const planet = pairStateAt(tPlanet);
  if (!planet) return undefined;
  if (!system.moon) return { planet, moon: undefined };

  const moon = pairStateAt(tMoon);
  return moon ? { planet, moon } : undefined;
}

function resolveDirectEmissionTime(args: {
  tObs: number;
  observerDir: Vec3;
  rel: ReturnType<typeof normalizeRelativityParams>;
  shapiroSolve: LightTimeShapiroConfig | undefined;
  rAtTime: (time: number) => Vec3;
}): number {
  const { tObs, observerDir, rel, shapiroSolve, rAtTime } = args;
  return solveLightTimeCorrectedTime({
    tObs,
    rAtTime,
    observerDir,
    c: rel.c,
    shapiro: shapiroSolve,
    maxIters: rel.ltteIters,
    tolSec: rel.ltteTolSec,
  });
}

function buildDirectKeplerSystemState(args: {
  system: SystemParams;
  tObs: number;
  observerDir: Vec3;
  kinAtT: BodyKinematics;
  planetPairState: DirectPairState;
  moonPairState: DirectPairState | undefined;
}): DynamicSystemState {
  const { system, tObs, observerDir, kinAtT, planetPairState, moonPairState } = args;
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

  sanitizeDynamicVelocities(planet, moon, star);

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
