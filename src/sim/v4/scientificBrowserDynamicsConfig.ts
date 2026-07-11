import { assertOrbit } from "../validation/assertions";
import type { SimulationConfigV4 } from "./types";

function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

function isFiniteNonNegative(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0;
}

function isFiniteIntegerAtLeast(x: unknown, min: number): x is number {
  return typeof x === "number" && Number.isFinite(x) && Number.isInteger(x) && x >= min;
}

type DynamicsConfig = NonNullable<SimulationConfigV4["dynamics"]>;
type RelativityConfig = NonNullable<DynamicsConfig["relativity"]>;
type NBodyPlanetMoonConfig = NonNullable<DynamicsConfig["nbodyPlanetMoon"]>;
type MassSourceBody = { m?: number };

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
  collectRelativityLevelIssues(dyn, issues);
  collectLtteIssues(rel, issues);
  collectShapiroIssues(rel, issues);
  return issues;
}

function collectRelativityLevelIssues(dyn: DynamicsConfig | undefined, issues: string[]): void {
  if (dyn?.relativityLevel !== undefined) return;
  issues.push(
    'scientific-browser relativity requires an explicit dynamics.relativityLevel ("toy" or "enhanced")',
  );
}

function collectLtteIssues(rel: RelativityConfig, issues: string[]): void {
  if (rel.ltte === false) return;
  if (!isFinitePositive(rel.c)) {
    issues.push(
      "scientific-browser relativity requires an explicit positive relativity.c when LTTE is enabled",
    );
  }
  if (!isFiniteIntegerAtLeast(rel.ltteIters, 1)) {
    issues.push(
      "scientific-browser relativity requires an explicit integer relativity.ltteIters >= 1 when LTTE is enabled",
    );
  }
  if (!isFinitePositive(rel.ltteTolSec)) {
    issues.push(
      "scientific-browser relativity requires an explicit positive relativity.ltteTolSec when LTTE is enabled",
    );
  }
}

function collectShapiroIssues(rel: RelativityConfig, issues: string[]): void {
  if (rel.ltte === false || rel.shapiro === false) return;
  if (isFiniteNonNegative(rel.shapiroMinImpact)) return;
  issues.push(
    "scientific-browser relativity requires an explicit finite relativity.shapiroMinImpact >= 0 when Shapiro is enabled",
  );
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
  collectNBodyMassSourceIssues(nbody, star, planet, moon, issues);
  collectNBodyStepIssues(nbody, issues);
  return issues;
}

function collectNBodyMassSourceIssues(
  nbody: NBodyPlanetMoonConfig,
  star: MassSourceBody | undefined,
  planet: MassSourceBody | undefined,
  moon: MassSourceBody | undefined,
  issues: string[],
): void {
  if (!hasAnyFinitePositive([nbody.muStar, nbody.mStar, star?.m])) {
    issues.push("scientific-browser nbodyPlanetMoon requires an explicit positive star mass source");
  }
  if (!hasAnyFinitePositive([nbody.muPlanet, nbody.mPlanet, planet?.m])) {
    issues.push("scientific-browser nbodyPlanetMoon requires an explicit positive planet mass source");
  }
  if (!hasAnyFinitePositive([nbody.muMoon, nbody.mMoon, moon?.m])) {
    issues.push("scientific-browser nbodyPlanetMoon requires an explicit positive moon mass source");
  }
}

function hasAnyFinitePositive(values: unknown[]): boolean {
  for (const value of values) {
    if (isFinitePositive(value)) return true;
  }
  return false;
}

function collectNBodyStepIssues(nbody: NBodyPlanetMoonConfig, issues: string[]): void {
  if (!isFinitePositive(nbody.dtMax)) {
    issues.push("scientific-browser nbodyPlanetMoon requires dtMax > 0");
  }
}
