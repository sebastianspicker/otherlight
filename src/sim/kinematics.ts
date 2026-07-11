import type { OrbitElements, SkyPoint, SystemParams } from "../core/types";
import { G_SI, isFinitePositive } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { projectToSky } from "../physics/frames";
import {
  applyApsidalPrecession,
  normalizeRelativityParams,
  resolveGrPrecessionPerOrbit,
  solveLightTimeCorrectedResult,
} from "../physics/relativity";
import { muFromPeriodAndA } from "../physics/kepler";
import { posFromResolvedElements } from "./orbits";
import { getNBodyStateAt, isNBodyEnabled } from "./dynamics";
import { getMoonStateAt, resolvePlanetOrbitForKinematics, type BodyKinematics } from "./kinematicsHelpers";
import { baseShapiroParams, type LightTimeShapiroConfig } from "./kinematicsShapiro";
import { vSub } from "../physics/vec3";

export type { BodyKinematics, MoonStateAt } from "./kinematicsHelpers";
export {
  getExomoonConfig,
  getMoonStateAt,
  resolveMoonOrbitForKinematics,
  resolvePlanetOrbitForKinematics,
} from "./kinematicsHelpers";

type LightTimeSolve = ReturnType<typeof solveLightTimeCorrectedResult>;
type KinematicsContext = {
  params: SystemParams;
  t: number;
  observerDir: Vec3;
  rel: ReturnType<typeof normalizeRelativityParams>;
  nbodyActive: boolean;
  muStarRel: number | undefined;
  shapiroParams: LightTimeShapiroConfig | undefined;
};
type BaseOrbitState = {
  planetOrbit: OrbitElements;
  rBary: Vec3;
};
type KinematicsResolution = {
  planetOrbit: OrbitElements;
  rBaryOut: Vec3;
  rPlanetAbs: Vec3;
  rMoonAbs?: Vec3;
  moonSky?: SkyPoint;
  timingSolve?: BodyKinematics["timingSolve"];
};
type EmissionTimes = {
  tPlanet: number;
  tMoon: number;
  timingSolve?: BodyKinematics["timingSolve"];
};
type KeplerAccessors = {
  planetOrbitAt: (time: number) => OrbitElements;
  rBaryAt: (time: number) => Vec3;
  planetAbsAt: (time: number) => Vec3;
  moonAbsAt: (time: number) => Vec3;
};

export function computeBodyKinematics(params: SystemParams, t: number, observerDir: Vec3): BodyKinematics {
  if (!Number.isFinite(t)) throw new Error("computeBodyKinematics: t must be finite.");

  const nbodyActive = isNBodyEnabled(params);
  const rel = normalizeRelativityParams(params.dynamics?.relativity);
  const base = baseOrbitState(params, t);
  const context = kinematicsContext(params, t, observerDir, rel, nbodyActive, base.planetOrbit);
  const resolved = nbodyActive ? resolveNBodyKinematics(context, base) : resolveKeplerKinematics(context);
  const planetSky = projectToSky(resolved.rPlanetAbs, observerDir);

  return {
    planetOrbit: resolved.planetOrbit,
    rBary: resolved.rBaryOut,
    rPlanetAbs: resolved.rPlanetAbs,
    rMoonAbs: resolved.rMoonAbs,
    planetSky,
    moonSky: resolved.moonSky,
    timingSolve: resolved.timingSolve,
  };
}

function baseOrbitState(params: SystemParams, t: number): BaseOrbitState {
  const planetOrbit = resolvePlanetOrbitForKinematics(params, t, "planet.orbit");
  return {
    planetOrbit,
    rBary: posFromResolvedElements(planetOrbit, t, "planet.orbit"),
  };
}

function kinematicsContext(
  params: SystemParams,
  t: number,
  observerDir: Vec3,
  rel: ReturnType<typeof normalizeRelativityParams>,
  nbodyActive: boolean,
  planetOrbit: OrbitElements,
): KinematicsContext {
  const muStarRel = resolveRelativityMuStar(params, planetOrbit, nbodyActive);
  return {
    params,
    t,
    observerDir,
    rel,
    nbodyActive,
    muStarRel,
    shapiroParams: baseShapiroParams(params, rel, muStarRel),
  };
}

function resolveRelativityMuStar(
  params: SystemParams,
  planetOrbit: OrbitElements,
  nbodyActive: boolean,
): number | undefined {
  if (nbodyActive && isFinitePositive(params.dynamics?.nbodyPlanetMoon?.muStar)) {
    return params.dynamics!.nbodyPlanetMoon!.muStar;
  }

  try {
    const mu = muFromPeriodAndA(planetOrbit.period, planetOrbit.a);
    return Number.isFinite(mu) && mu > 0 ? mu : undefined;
  } catch {
    return undefined;
  }
}

function resolveNBodyKinematics(context: KinematicsContext, base: BaseOrbitState): KinematicsResolution {
  const shapiroSolve = nBodyShapiroConfig(context);
  const emission = solveNBodyEmissionTimes(context, base.rBary, shapiroSolve);
  const planetOrbit = resolvePlanetOrbitForKinematics(context.params, emission.tPlanet, "planet.orbit");
  const nbodyPlanet = getNBodyStateAt(context.params, emission.tPlanet);
  const planetState = nBodyPlanetState(base.rBary, nbodyPlanet);
  const moonState = nBodyMoonState(context, nbodyPlanet, emission);

  return {
    planetOrbit,
    rBaryOut: planetState.rBaryOut,
    rPlanetAbs: planetState.rPlanetAbs,
    rMoonAbs: moonState.rMoonAbs,
    moonSky: moonState.moonSky,
    timingSolve: emission.timingSolve,
  };
}

function nBodyShapiroConfig(context: KinematicsContext): LightTimeShapiroConfig | undefined {
  const { params, rel } = context;
  if (rel.enabled && rel.shapiro && params.dynamics?.relativityLevel === "enhanced") {
    return {
      enabled: true,
      minImpact: rel.shapiroMinImpact,
      massesAtTime: (time) => nBodyShapiroMassesAtTime(context, time),
    };
  }

  return context.shapiroParams;
}

function nBodyShapiroMassesAtTime(context: KinematicsContext, time: number): Array<{ mu: number; r: Vec3 }> {
  const nb = getNBodyStateAt(context.params, time);
  if (!nb) return [];

  const masses: Array<{ mu: number; r: Vec3 }> = [];
  if (isFinitePositive(context.muStarRel)) {
    masses.push({ mu: context.muStarRel, r: { x: 0, y: 0, z: 0 } });
  }
  if (isFinitePositive(context.params.planet.m)) {
    masses.push({ mu: G_SI * context.params.planet.m, r: vSub(nb.state.rP, nb.state.rS) });
  }
  if (isFinitePositive(context.params.moon?.m)) {
    masses.push({ mu: G_SI * context.params.moon!.m!, r: vSub(nb.state.rM, nb.state.rS) });
  }
  return masses;
}

function solveNBodyEmissionTimes(
  context: KinematicsContext,
  fallback: Vec3,
  shapiro: LightTimeShapiroConfig | undefined,
): EmissionTimes {
  const ltteOn = ltteEnabled(context);
  const tPlanetSolve = solveNBodyPlanetLightTime(context, fallback, shapiro, ltteOn);
  const tMoonSolve = solveNBodyMoonLightTime(context, fallback, shapiro, ltteOn);
  return emissionTimesFromSolves(context.t, ltteOn, tPlanetSolve, tMoonSolve);
}

function solveNBodyPlanetLightTime(
  context: KinematicsContext,
  fallback: Vec3,
  shapiro: LightTimeShapiroConfig | undefined,
  ltteOn: boolean,
): LightTimeSolve | undefined {
  if (!ltteOn) return undefined;

  return solveKinematicsLightTime(context, shapiro, (time) =>
    nBodyRelativePositionAt(context.params, time, "planet", fallback),
  );
}

function solveNBodyMoonLightTime(
  context: KinematicsContext,
  fallback: Vec3,
  shapiro: LightTimeShapiroConfig | undefined,
  ltteOn: boolean,
): LightTimeSolve | undefined {
  if (!ltteOn || !context.params.moon) return undefined;

  return solveKinematicsLightTime(context, shapiro, (time) =>
    nBodyRelativePositionAt(context.params, time, "moon", fallback),
  );
}

function solveKinematicsLightTime(
  context: KinematicsContext,
  shapiro: LightTimeShapiroConfig | undefined,
  rAtTime: (time: number) => Vec3,
): LightTimeSolve {
  const { t, observerDir, rel } = context;
  return solveLightTimeCorrectedResult({
    tObs: t,
    rAtTime,
    observerDir,
    c: rel.c,
    shapiro,
    maxIters: rel.ltteIters,
    tolSec: rel.ltteTolSec,
  });
}

function nBodyRelativePositionAt(
  params: SystemParams,
  time: number,
  body: "planet" | "moon",
  fallback: Vec3,
): Vec3 {
  const nb = getNBodyStateAt(params, time);
  if (!nb) return fallback;
  return body === "planet" ? vSub(nb.state.rP, nb.state.rS) : vSub(nb.state.rM, nb.state.rS);
}

function nBodyPlanetState(
  fallback: Vec3,
  nbodyPlanet: ReturnType<typeof getNBodyStateAt>,
): Pick<KinematicsResolution, "rBaryOut" | "rPlanetAbs"> {
  if (!nbodyPlanet) return { rBaryOut: fallback, rPlanetAbs: fallback };

  return {
    rBaryOut: nbodyPlanet.rBary,
    rPlanetAbs: vSub(nbodyPlanet.state.rP, nbodyPlanet.state.rS),
  };
}

function nBodyMoonState(
  context: KinematicsContext,
  nbodyPlanet: ReturnType<typeof getNBodyStateAt>,
  emission: EmissionTimes,
): Pick<KinematicsResolution, "rMoonAbs" | "moonSky"> {
  const { params, rel, observerDir } = context;
  if (!params.moon) return {};

  const nbodyMoon =
    rel.enabled && rel.ltte && emission.tMoon !== emission.tPlanet
      ? getNBodyStateAt(params, emission.tMoon)
      : nbodyPlanet;
  if (!nbodyMoon) return {};

  const rMoonAbs = vSub(nbodyMoon.state.rM, nbodyMoon.state.rS);
  return { rMoonAbs, moonSky: projectToSky(rMoonAbs, observerDir) };
}

function resolveKeplerKinematics(context: KinematicsContext): KinematicsResolution {
  const accessors = keplerAccessors(context);
  const shapiro = keplerShapiroConfig(context, accessors);
  const emission = solveKeplerEmissionTimes(context, accessors, shapiro);
  const planetOrbit = accessors.planetOrbitAt(emission.tPlanet);
  const rBaryOut = accessors.rBaryAt(emission.tPlanet);
  const planetState = getMoonStateAt(
    context.params,
    emission.tPlanet,
    context.observerDir,
    rBaryOut,
    context.rel,
  );
  const moonState = keplerMoonStateAtEmission(context, accessors, emission.tMoon);

  return {
    planetOrbit,
    rBaryOut,
    rPlanetAbs: planetState ? planetState.rPlanetAbs : rBaryOut,
    rMoonAbs: moonState.rMoonAbs,
    moonSky: moonState.moonSky,
    timingSolve: emission.timingSolve,
  };
}

function keplerAccessors(context: KinematicsContext): KeplerAccessors {
  const grOn = context.rel.enabled && context.rel.grPrecession;
  const planetOrbitAt = (time: number): OrbitElements => {
    const base = resolvePlanetOrbitForKinematics(context.params, time, "planet.orbit");
    if (!grOn) return base;

    const prec = resolveGrPrecessionPerOrbit({
      orbit: base,
      c: context.rel.c,
      override: context.rel.planetPrecessionPerOrbit,
    });
    return applyApsidalPrecession(base, time, prec);
  };
  const rBaryAt = (time: number): Vec3 => posFromResolvedElements(planetOrbitAt(time), time, "planet.orbit");
  const planetAbsAt = (time: number): Vec3 => {
    const rBary = rBaryAt(time);
    const moonState = getMoonStateAt(context.params, time, context.observerDir, rBary, context.rel);
    return moonState ? moonState.rPlanetAbs : rBary;
  };
  const moonAbsAt = (time: number): Vec3 => {
    const rBary = rBaryAt(time);
    const moonState = getMoonStateAt(context.params, time, context.observerDir, rBary, context.rel);
    return moonState?.rMoonAbs ?? rBary;
  };

  return { planetOrbitAt, rBaryAt, planetAbsAt, moonAbsAt };
}

function keplerShapiroConfig(
  context: KinematicsContext,
  accessors: KeplerAccessors,
): LightTimeShapiroConfig | undefined {
  const { params, rel } = context;
  if (rel.enabled && rel.shapiro && params.dynamics?.relativityLevel === "enhanced") {
    return {
      enabled: true,
      minImpact: rel.shapiroMinImpact,
      massesAtTime: (time) => keplerShapiroMassesAtTime(context, accessors, time),
    };
  }

  return context.shapiroParams;
}

function keplerShapiroMassesAtTime(
  context: KinematicsContext,
  accessors: KeplerAccessors,
  time: number,
): Array<{ mu: number; r: Vec3 }> {
  const masses: Array<{ mu: number; r: Vec3 }> = [];
  if (isFinitePositive(context.muStarRel)) {
    masses.push({ mu: context.muStarRel, r: { x: 0, y: 0, z: 0 } });
  }
  if (isFinitePositive(context.params.planet.m)) {
    masses.push({ mu: G_SI * context.params.planet.m, r: accessors.planetAbsAt(time) });
  }
  if (context.params.moon && isFinitePositive(context.params.moon.m)) {
    masses.push({ mu: G_SI * context.params.moon.m, r: accessors.moonAbsAt(time) });
  }
  return masses;
}

function solveKeplerEmissionTimes(
  context: KinematicsContext,
  accessors: KeplerAccessors,
  shapiro: LightTimeShapiroConfig | undefined,
): EmissionTimes {
  const ltteOn = ltteEnabled(context);
  const tPlanetSolve = solveKeplerPlanetLightTime(context, accessors, shapiro, ltteOn);
  const tMoonSolve = solveKeplerMoonLightTime(context, accessors, shapiro, ltteOn);
  return emissionTimesFromSolves(context.t, ltteOn, tPlanetSolve, tMoonSolve);
}

function solveKeplerPlanetLightTime(
  context: KinematicsContext,
  accessors: KeplerAccessors,
  shapiro: LightTimeShapiroConfig | undefined,
  ltteOn: boolean,
): LightTimeSolve | undefined {
  if (!ltteOn) return undefined;
  return solveKinematicsLightTime(context, shapiro, accessors.planetAbsAt);
}

function solveKeplerMoonLightTime(
  context: KinematicsContext,
  accessors: KeplerAccessors,
  shapiro: LightTimeShapiroConfig | undefined,
  ltteOn: boolean,
): LightTimeSolve | undefined {
  if (!ltteOn || !context.params.moon) return undefined;
  return solveKinematicsLightTime(context, shapiro, accessors.moonAbsAt);
}

function ltteEnabled(context: KinematicsContext): boolean {
  return context.rel.enabled && context.rel.ltte;
}

function emissionTimesFromSolves(
  tObs: number,
  ltteOn: boolean,
  planetSolve: LightTimeSolve | undefined,
  moonSolve: LightTimeSolve | undefined,
): EmissionTimes {
  return {
    tPlanet: emitTimeOrObserved(tObs, planetSolve),
    tMoon: emitTimeOrObserved(tObs, moonSolve),
    timingSolve: emissionTimingDiagnostics(ltteOn, planetSolve, moonSolve),
  };
}

function emitTimeOrObserved(tObs: number, solve: LightTimeSolve | undefined): number {
  return solve ? solve.tEmit : tObs;
}

function emissionTimingDiagnostics(
  ltteOn: boolean,
  planetSolve: LightTimeSolve | undefined,
  moonSolve: LightTimeSolve | undefined,
): BodyKinematics["timingSolve"] {
  if (!ltteOn) return undefined;
  return { planet: planetSolve?.diagnostics, moon: moonSolve?.diagnostics };
}

function keplerMoonStateAtEmission(
  context: KinematicsContext,
  accessors: KeplerAccessors,
  tMoon: number,
): Pick<KinematicsResolution, "rMoonAbs" | "moonSky"> {
  if (!context.params.moon) return {};

  const rBaryMoon = accessors.rBaryAt(tMoon);
  const moonState = getMoonStateAt(context.params, tMoon, context.observerDir, rBaryMoon, context.rel);
  return moonState ? { rMoonAbs: moonState.rMoonAbs, moonSky: moonState.moonSky } : {};
}
