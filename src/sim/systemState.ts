import type { OrbitElements, SkyPoint, SystemParams } from "../core/types";
import { G_SI, normalizeFiniteDiffDtSec } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { VEC3ZERO, vAdd, vAddScaled, vCross, vIsFinite, vScale } from "../physics/vec3";
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
  solveLightTimeCorrectedTime,
} from "../physics/relativity";
import { muFromPeriodAndA } from "../physics/kepler";

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
    let planetState: Pick<DynamicBodyState, "r" | "v"> = {
      r: baryState.r,
      v: baryState.v,
    };
    let moonState: Pick<DynamicBodyState, "r" | "v"> | undefined;

    if (system.moon) {
      const moonOrbitBase = resolveMoonOrbitForKinematics(system, time, "moon.orbitAroundPlanet");
      if (!moonOrbitBase) return undefined;
      const moonOrbitEvolved = evolveMoonOrbitForExomoonTiming(system, time, moonOrbitBase);
      const moonOrbit =
        rel.enabled && rel.grPrecession
          ? applyApsidalPrecession(
              moonOrbitEvolved,
              time,
              resolveGrPrecessionPerOrbit({
                orbit: moonOrbitEvolved,
                c: rel.c,
                override: rel.moonPrecessionPerOrbit,
              }),
            )
          : moonOrbitEvolved;
      const muPlanetMoon = muFromPeriodAndA(moonOrbit.period, moonOrbit.a);
      const moonRelStateBase = stateFromResolvedElements(
        moonOrbit,
        time,
        muPlanetMoon,
        "moon.orbitAroundPlanet",
      );
      const orientationAngularVelocity = exomoonTimingAngularVelocity(system, moonOrbitEvolved);
      const moonRelState = {
        r: moonRelStateBase.r,
        v: vAdd(moonRelStateBase.v, vCross(orientationAngularVelocity, moonRelStateBase.r)),
      };
      const split = trySplitBarycentricPair({
        rBary: baryState.r,
        rRel: moonRelState.r,
        mPrimary: system.planet.m,
        mSecondary: system.moon.m,
      });

      if (split) {
        planetState = {
          r: split.rPrimary,
          v: vAddScaled(baryState.v, moonRelState.v, -split.muSecondary),
        };
        moonState = {
          r: split.rSecondary,
          v: vAddScaled(baryState.v, moonRelState.v, split.muPrimary),
        };
      } else {
        moonState = {
          r: vAdd(baryState.r, moonRelState.r),
          v: vAdd(baryState.v, moonRelState.v),
        };
      }

      if (moonState && Number.isFinite(exo?.moonImpactYDot) && exo!.moonImpactYDot !== 0) {
        const yDot = exo!.moonImpactYDot as number;
        const tRef = Number.isFinite(exo?.tRef) ? (exo!.tRef as number) : 0;
        const driftY = (time - tRef) * yDot;
        const { ey } = buildSkyBasis(observerDir);
        moonState = {
          r: vAddScaled(moonState.r, ey, driftY),
          v: vAddScaled(moonState.v, ey, yDot),
        };
      }
    }

    return {
      baryState,
      planet: planetState,
      moon: moonState,
    };
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
  const nbodySample = isNBodyEnabled(system) ? getNBodyStateAt(system, tObs) : null;

  if (nbodySample) {
    const planet: DynamicBodyState = {
      r: {
        x: nbodySample.state.rP.x - nbodySample.state.rS.x,
        y: nbodySample.state.rP.y - nbodySample.state.rS.y,
        z: nbodySample.state.rP.z - nbodySample.state.rS.z,
      },
      v: {
        x: nbodySample.state.vP.x - nbodySample.state.vS.x,
        y: nbodySample.state.vP.y - nbodySample.state.vS.y,
        z: nbodySample.state.vP.z - nbodySample.state.vS.z,
      },
      sky: kinAtT.planetSky,
    };

    const moon: DynamicBodyState | undefined = kinAtT.rMoonAbs
      ? {
          r: {
            x: nbodySample.state.rM.x - nbodySample.state.rS.x,
            y: nbodySample.state.rM.y - nbodySample.state.rS.y,
            z: nbodySample.state.rM.z - nbodySample.state.rS.z,
          },
          v: {
            x: nbodySample.state.vM.x - nbodySample.state.vS.x,
            y: nbodySample.state.vM.y - nbodySample.state.vS.y,
            z: nbodySample.state.vM.z - nbodySample.state.vS.z,
          },
          sky: kinAtT.moonSky ?? projectToSky(kinAtT.rMoonAbs, observerDir),
        }
      : undefined;

    const star: DynamicBodyState = {
      r: nbodySample.state.rS,
      v: nbodySample.state.vS,
      sky: projectToSky(nbodySample.state.rS, observerDir),
    };

    if (!vIsFinite(planet.v)) planet.v = VEC3ZERO;
    if (moon && !vIsFinite(moon.v)) moon.v = VEC3ZERO;
    if (!vIsFinite(star.v)) star.v = VEC3ZERO;

    return { tObs, observerDir, planet, moon, star };
  }

  if (canUseDirectKeplerState(system)) {
    const direct = resolveDirectKeplerSystemState({ system, tObs, observerDir, kinAtT });
    if (direct) return direct;
  }

  const kinAt = (t: number) => computeBodyKinematics(system, t, observerDir);
  const planetPosAt = (t: number) => kinAt(t).rPlanetAbs;
  const moonPosAt = (t: number) => kinAt(t).rMoonAbs ?? VEC3ZERO;

  const planet: DynamicBodyState = {
    r: kinAtT.rPlanetAbs,
    v: finiteDiffVelocity(planetPosAt, tObs, dt, true),
    sky: kinAtT.planetSky,
  };

  const moon: DynamicBodyState | undefined = kinAtT.rMoonAbs
    ? {
        r: kinAtT.rMoonAbs,
        v: finiteDiffVelocity(moonPosAt, tObs, dt, true),
        sky: kinAtT.moonSky ?? projectToSky(kinAtT.rMoonAbs, observerDir),
      }
    : undefined;

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
