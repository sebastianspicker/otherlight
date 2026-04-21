import { assertOrbit } from "../validation/assertions";
import type { SimulationConfigV4 } from "./types";

function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

export function collectScientificBrowserOrbitIssues(config: SimulationConfigV4): string[] {
  const issues: string[] = [];
  const collect = (orbit: unknown, name: string): void => {
    try {
      assertOrbit(orbit as Parameters<typeof assertOrbit>[0], name);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  };

  collect(config.orbits.binary, "orbits.binary");
  for (const planet of config.bodies.planets) collect(planet.orbit, `planet "${planet.id}".orbit`);
  for (const moon of config.bodies.moons) collect(moon.orbit, `moon "${moon.id}".orbit`);
  return issues;
}

export function collectScientificBrowserRelativityIssues(config: SimulationConfigV4): string[] {
  const dyn = config.dynamics;
  const rel = dyn?.relativity;
  if (!rel?.enabled) return [];

  const issues: string[] = [];
  if (dyn?.relativityLevel === undefined) {
    issues.push(
      'scientific-browser relativity requires an explicit dynamics.relativityLevel ("toy" or "enhanced")',
    );
  }

  const useLTTE = rel.ltte !== false;
  if (useLTTE) {
    if (!isFinitePositive(rel.c)) {
      issues.push(
        "scientific-browser relativity requires an explicit positive relativity.c when LTTE is enabled",
      );
    }
    const ltteIters = rel.ltteIters;
    if (
      !(
        typeof ltteIters === "number" &&
        Number.isFinite(ltteIters) &&
        Number.isInteger(ltteIters) &&
        ltteIters >= 1
      )
    ) {
      issues.push(
        "scientific-browser relativity requires an explicit integer relativity.ltteIters >= 1 when LTTE is enabled",
      );
    }
    const ltteTolSec = rel.ltteTolSec;
    if (!(typeof ltteTolSec === "number" && Number.isFinite(ltteTolSec) && ltteTolSec > 0)) {
      issues.push(
        "scientific-browser relativity requires an explicit positive relativity.ltteTolSec when LTTE is enabled",
      );
    }
  }

  const useShapiro = useLTTE && rel.shapiro !== false;
  const shapiroMinImpact = rel.shapiroMinImpact;
  if (
    useShapiro &&
    !(typeof shapiroMinImpact === "number" && Number.isFinite(shapiroMinImpact) && shapiroMinImpact >= 0)
  ) {
    issues.push(
      "scientific-browser relativity requires an explicit finite relativity.shapiroMinImpact >= 0 when Shapiro is enabled",
    );
  }

  return issues;
}

export function collectScientificBrowserNBodyIssues(config: SimulationConfigV4): string[] {
  const nbody = config.dynamics?.nbodyPlanetMoon;
  if (!nbody?.enabled) return [];

  const issues: string[] = [];
  const [planet] = config.bodies.planets;
  const [moon] = config.bodies.moons;
  const [star] = config.bodies.stars;

  if (!moon) {
    issues.push("scientific-browser nbodyPlanetMoon requires an explicit moon body");
  }

  const hasStarMassSource =
    isFinitePositive(nbody.muStar) || isFinitePositive(nbody.mStar) || isFinitePositive(star?.m);
  const hasPlanetMassSource =
    isFinitePositive(nbody.muPlanet) || isFinitePositive(nbody.mPlanet) || isFinitePositive(planet?.m);
  const hasMoonMassSource =
    isFinitePositive(nbody.muMoon) || isFinitePositive(nbody.mMoon) || isFinitePositive(moon?.m);

  if (!hasStarMassSource) {
    issues.push("scientific-browser nbodyPlanetMoon requires an explicit positive star mass source");
  }
  if (!hasPlanetMassSource) {
    issues.push("scientific-browser nbodyPlanetMoon requires an explicit positive planet mass source");
  }
  if (!hasMoonMassSource) {
    issues.push("scientific-browser nbodyPlanetMoon requires an explicit positive moon mass source");
  }
  if (!isFinitePositive(nbody.dtMax)) {
    issues.push("scientific-browser nbodyPlanetMoon requires dtMax > 0");
  }

  return issues;
}
