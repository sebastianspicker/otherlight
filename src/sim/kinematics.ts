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
import { vSub } from "../physics/vec3";

export type { BodyKinematics, MoonStateAt } from "./kinematicsHelpers";
export {
  getExomoonConfig,
  getMoonStateAt,
  resolveMoonOrbitForKinematics,
  resolvePlanetOrbitForKinematics,
} from "./kinematicsHelpers";

export function computeBodyKinematics(params: SystemParams, t: number, observerDir: Vec3): BodyKinematics {
  if (!Number.isFinite(t)) throw new Error("computeBodyKinematics: t must be finite.");

  const nbodyActive = isNBodyEnabled(params);
  const rel = normalizeRelativityParams(params.dynamics?.relativity);

  // Base: planet orbit (or barycenter orbit if masses exist and splitting is possible).
  let planetOrbit = resolvePlanetOrbitForKinematics(params, t, "planet.orbit");
  const rBary = posFromResolvedElements(planetOrbit, t, "planet.orbit");

  const muStarRel =
    nbodyActive && isFinitePositive(params.dynamics?.nbodyPlanetMoon?.muStar)
      ? params.dynamics!.nbodyPlanetMoon!.muStar
      : (() => {
          try {
            const mu = muFromPeriodAndA(planetOrbit.period, planetOrbit.a);
            return Number.isFinite(mu) && mu > 0 ? mu : undefined;
          } catch {
            // Fail-open: mu derivation failed; Shapiro delay correction will be skipped.
            return undefined;
          }
        })();

  const shapiroParams =
    rel.enabled && rel.shapiro && isFinitePositive(muStarRel)
      ? {
          enabled: true,
          mu:
            params.dynamics?.relativityLevel === "enhanced"
              ? muStarRel +
                (isFinitePositive(params.planet.m) ? G_SI * params.planet.m : 0) +
                (isFinitePositive(params.moon?.m) ? G_SI * params.moon!.m! : 0)
              : muStarRel,
          minImpact: rel.shapiroMinImpact,
        }
      : undefined;

  let rPlanetAbs: Vec3 = rBary;
  let rMoonAbs: Vec3 | undefined;
  let moonSky: SkyPoint | undefined;
  let timingSolve: BodyKinematics["timingSolve"];

  let rBaryOut = rBary;

  if (nbodyActive) {
    const shapiroSolve =
      rel.enabled && rel.shapiro && params.dynamics?.relativityLevel === "enhanced"
        ? {
            enabled: true,
            minImpact: rel.shapiroMinImpact,
            massesAtTime: (ti: number) => {
              const nb = getNBodyStateAt(params, ti);
              if (!nb) return [];
              return [
                isFinitePositive(muStarRel) ? { mu: muStarRel, r: { x: 0, y: 0, z: 0 } } : null,
                isFinitePositive(params.planet.m)
                  ? {
                      mu: G_SI * params.planet.m,
                      r: vSub(nb.state.rP, nb.state.rS),
                    }
                  : null,
                isFinitePositive(params.moon?.m)
                  ? {
                      mu: G_SI * params.moon!.m!,
                      r: vSub(nb.state.rM, nb.state.rS),
                    }
                  : null,
              ].filter(Boolean) as Array<{ mu: number; r: Vec3 }>;
            },
          }
        : shapiroParams;

    const ltteOn = rel.enabled && rel.ltte;
    const tPlanetSolve = ltteOn
      ? solveLightTimeCorrectedResult({
          tObs: t,
          rAtTime: (ti) => {
            const nb = getNBodyStateAt(params, ti);
            return nb ? vSub(nb.state.rP, nb.state.rS) : rBary;
          },
          observerDir,
          c: rel.c,
          shapiro: shapiroSolve,
          maxIters: rel.ltteIters,
          tolSec: rel.ltteTolSec,
        })
      : undefined;
    const tMoonSolve =
      ltteOn && params.moon
        ? solveLightTimeCorrectedResult({
            tObs: t,
            rAtTime: (ti) => {
              const nb = getNBodyStateAt(params, ti);
              return nb ? vSub(nb.state.rM, nb.state.rS) : rBary;
            },
            observerDir,
            c: rel.c,
            shapiro: shapiroSolve,
            maxIters: rel.ltteIters,
            tolSec: rel.ltteTolSec,
          })
        : undefined;
    const tPlanet = tPlanetSolve?.tEmit ?? t;
    const tMoon = tMoonSolve?.tEmit ?? t;
    if (ltteOn) {
      timingSolve = {
        planet: tPlanetSolve?.diagnostics,
        moon: tMoonSolve?.diagnostics,
      };
    }

    planetOrbit = resolvePlanetOrbitForKinematics(params, tPlanet, "planet.orbit");

    const nbodyPlanet = getNBodyStateAt(params, tPlanet);
    if (nbodyPlanet) {
      rBaryOut = nbodyPlanet.rBary;
      rPlanetAbs = vSub(nbodyPlanet.state.rP, nbodyPlanet.state.rS);
    }

    if (params.moon) {
      const nbodyMoon = ltteOn && tMoon !== tPlanet ? getNBodyStateAt(params, tMoon) : nbodyPlanet;
      if (nbodyMoon) {
        rMoonAbs = vSub(nbodyMoon.state.rM, nbodyMoon.state.rS);
        moonSky = rMoonAbs ? projectToSky(rMoonAbs, observerDir) : undefined;
      }
    }
  } else {
    const grOn = rel.enabled && rel.grPrecession;
    const ltteOn = rel.enabled && rel.ltte;

    const planetOrbitAt = (ti: number): OrbitElements => {
      const base = resolvePlanetOrbitForKinematics(params, ti, "planet.orbit");
      if (!grOn) return base;
      const prec = resolveGrPrecessionPerOrbit({
        orbit: base,
        c: rel.c,
        override: rel.planetPrecessionPerOrbit,
      });
      return applyApsidalPrecession(base, ti, prec);
    };

    const rBaryAt = (ti: number): Vec3 => {
      const el = planetOrbitAt(ti);
      return posFromResolvedElements(el, ti, "planet.orbit");
    };

    const planetAbsAt = (ti: number): Vec3 => {
      const rB = rBaryAt(ti);
      const moonState = getMoonStateAt(params, ti, observerDir, rB, rel);
      return moonState ? moonState.rPlanetAbs : rB;
    };

    const moonAbsAt = (ti: number): Vec3 => {
      const rB = rBaryAt(ti);
      const moonState = getMoonStateAt(params, ti, observerDir, rB, rel);
      return moonState?.rMoonAbs ?? rB;
    };

    // Build the enhanced multi-body Shapiro config once and reuse for both planet and moon LTTE.
    // Both solves use the same mass positions (star at origin, planet and moon at their Kepler
    // positions at the trial time), so there is no benefit in rebuilding the config per-solve.
    const keplerEnhancedShapiro =
      rel.enabled && rel.shapiro && params.dynamics?.relativityLevel === "enhanced"
        ? {
            enabled: true,
            minImpact: rel.shapiroMinImpact,
            massesAtTime: (ti: number): Array<{ mu: number; r: Vec3 }> => {
              const masses: Array<{ mu: number; r: Vec3 }> = [];
              if (isFinitePositive(muStarRel)) {
                masses.push({ mu: muStarRel, r: { x: 0, y: 0, z: 0 } });
              }
              if (isFinitePositive(params.planet.m)) {
                masses.push({ mu: G_SI * params.planet.m, r: planetAbsAt(ti) });
              }
              if (params.moon && isFinitePositive(params.moon.m)) {
                masses.push({ mu: G_SI * params.moon.m, r: moonAbsAt(ti) });
              }
              return masses;
            },
          }
        : shapiroParams;

    const tPlanetSolve = ltteOn
      ? solveLightTimeCorrectedResult({
          tObs: t,
          rAtTime: planetAbsAt,
          observerDir,
          c: rel.c,
          shapiro: keplerEnhancedShapiro,
          maxIters: rel.ltteIters,
          tolSec: rel.ltteTolSec,
        })
      : undefined;
    const tPlanet = tPlanetSolve?.tEmit ?? t;
    const tMoonSolve =
      ltteOn && params.moon
        ? solveLightTimeCorrectedResult({
            tObs: t,
            rAtTime: moonAbsAt,
            observerDir,
            c: rel.c,
            shapiro: keplerEnhancedShapiro,
            maxIters: rel.ltteIters,
            tolSec: rel.ltteTolSec,
          })
        : undefined;
    const tMoon = tMoonSolve?.tEmit ?? t;
    if (ltteOn) {
      timingSolve = {
        planet: tPlanetSolve?.diagnostics,
        moon: tMoonSolve?.diagnostics,
      };
    }

    planetOrbit = planetOrbitAt(tPlanet);
    const rBaryPlanet = rBaryAt(tPlanet);
    rBaryOut = rBaryPlanet;

    const moonStatePlanet = getMoonStateAt(params, tPlanet, observerDir, rBaryPlanet, rel);
    if (moonStatePlanet) {
      rPlanetAbs = moonStatePlanet.rPlanetAbs;
    } else {
      rPlanetAbs = rBaryPlanet;
    }

    if (params.moon) {
      const rBaryMoon = rBaryAt(tMoon);
      const moonState = getMoonStateAt(params, tMoon, observerDir, rBaryMoon, rel);
      if (moonState) {
        rMoonAbs = moonState.rMoonAbs;
        moonSky = moonState.moonSky;
      }
    }
  }

  const planetSky = projectToSky(rPlanetAbs, observerDir);

  return { planetOrbit, rBary: rBaryOut, rPlanetAbs, rMoonAbs, planetSky, moonSky, timingSolve };
}
