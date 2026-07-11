import { hasExplicitLimbDarkeningBandLaw } from "../../photometry/limbDarkening";
import { isSupportedStellarPassband } from "../../photometry/stellarBandFlux";
import type { SolveKeplerEOptions } from "../../physics/kepler";
import type { Vec3 } from "../../physics/vec3";
import { vLenSq, vNormalizeOrZero } from "../../physics/vec3";
import { createScientificBrowserRuntimeError } from "./scientificErrors";
import type {
  MoonBodyV4,
  PlanetBodyV4,
  RuntimeExecutionModeV4,
  SimulationConfigV4,
  StarBodyV4,
} from "./types";

export function finiteOrDefault(x: unknown, d: number): number {
  return Number.isFinite(x) ? (x as number) : d;
}

const finitePositiveOrDefault = (x: unknown, d: number): number => {
  const v = finiteOrDefault(x, d);
  return v > 0 ? v : d;
};

export function normalizeObserverDir(config: SimulationConfigV4): Vec3 {
  const dir = config.observer?.dir;
  const v: Vec3 = {
    x: finiteOrDefault(dir?.x, 0),
    y: finiteOrDefault(dir?.y, 0),
    z: finiteOrDefault(dir?.z, 1),
  };
  const n = vNormalizeOrZero(v);
  if (vLenSq(n) <= 0) return { x: 0, y: 0, z: 1 };
  return n;
}

type SnapshotLimbDarkeningModel = NonNullable<
  NonNullable<SimulationConfigV4["photometry"]>["limbDarkeningModel"]
>;

type BodyWithOblateness = {
  id: string;
  shape?: { oblateness?: number };
};

const hasExplicitPassband = (passband: unknown): boolean => {
  return typeof passband === "string" && passband.trim().length > 0;
};

const isScientificBrowserExecution = (config: SimulationConfigV4): boolean => {
  return config.runtime?.executionMode === "scientific-browser";
};

const isDetachedBinaryLab = (config: SimulationConfigV4): boolean => {
  return config.mode === "detached-binary-lab";
};

const isGeneralLabSecondaryStar = (config: SimulationConfigV4, index: number): boolean => {
  return config.mode === "general-lab" && index === 1;
};

const isFinitePositive = (value: unknown): boolean => {
  return Number.isFinite(value) && (value as number) > 0;
};

const isFiniteNonNegative = (value: unknown): boolean => {
  return Number.isFinite(value) && (value as number) >= 0;
};

const collectOblatenessIssue = (
  body: BodyWithOblateness | undefined,
  name: string,
  issues: string[],
): void => {
  const oblateness = body?.shape?.oblateness;
  if (oblateness === undefined) return;
  if (!(Number.isFinite(oblateness) && oblateness >= 0 && oblateness < 1)) {
    issues.push(`${name} shape.oblateness must be finite and in [0,1) when provided`);
  }
};

const collectObserverIssues = (config: SimulationConfigV4, issues: string[]): void => {
  const dir = config.observer?.dir;
  const observer = {
    x: finiteOrDefault(dir?.x, Number.NaN),
    y: finiteOrDefault(dir?.y, Number.NaN),
    z: finiteOrDefault(dir?.z, Number.NaN),
  };
  if (!(Number.isFinite(observer.x) && Number.isFinite(observer.y) && Number.isFinite(observer.z))) {
    issues.push("observer.dir must be finite");
  } else if (vLenSq(observer) <= 0) {
    issues.push("observer.dir must be non-zero");
  }
};

const collectDetachedBinaryLimbDarkeningIssue = (
  config: SimulationConfigV4,
  ldModel: SnapshotLimbDarkeningModel | undefined,
  issues: string[],
): void => {
  if (isDetachedBinaryLab(config) && !ldModel) {
    issues.push("photometry.limbDarkeningModel must be defined in detached-binary scientific-browser mode");
  }
};

const collectStarRadiusIssue = (star: StarBodyV4, issues: string[]): void => {
  if (!isFinitePositive(star.r)) {
    issues.push(`star "${star.id}" requires a finite positive radius`);
  }
};

const collectStarMassIssue = (
  config: SimulationConfigV4,
  star: StarBodyV4,
  index: number,
  issues: string[],
): void => {
  const validMass =
    isFinitePositive(star.m) || (isGeneralLabSecondaryStar(config, index) && isFiniteNonNegative(star.m));
  if (!validMass) {
    issues.push(`star "${star.id}" requires a finite positive mass`);
  }
};

const collectDetachedBinaryTemperatureIssue = (star: StarBodyV4, issues: string[]): void => {
  if (!isFinitePositive(star.teffK)) {
    issues.push(
      `star "${star.id}" must define a finite positive teffK in detached-binary scientific-browser mode`,
    );
  }
};

const collectDetachedBinaryPassbandIssue = (star: StarBodyV4, issues: string[]): void => {
  if (!hasExplicitPassband(star.passband)) {
    issues.push(
      `star "${star.id}" must define an explicit passband in detached-binary scientific-browser mode`,
    );
  } else if (!isSupportedStellarPassband(star.passband)) {
    issues.push(
      `star "${star.id}" passband "${String(star.passband)}" is not supported by the bounded scientific photometry path`,
    );
  }
};

const collectDetachedBinaryLoggIssue = (
  star: StarBodyV4,
  ldModel: SnapshotLimbDarkeningModel | undefined,
  issues: string[],
): void => {
  if (!ldModel || hasExplicitLimbDarkeningBandLaw(ldModel, star.passband) || isFinitePositive(star.loggCgs)) {
    return;
  }
  issues.push(
    `star "${star.id}" must define a finite positive loggCgs when photometry.limbDarkeningModel has no explicit law for passband "${String(star.passband)}" in detached-binary scientific-browser mode`,
  );
};

const collectDetachedBinaryStarIssues = (
  config: SimulationConfigV4,
  star: StarBodyV4,
  ldModel: SnapshotLimbDarkeningModel | undefined,
  issues: string[],
): void => {
  if (!isDetachedBinaryLab(config)) return;
  collectDetachedBinaryTemperatureIssue(star, issues);
  collectDetachedBinaryPassbandIssue(star, issues);
  collectDetachedBinaryLoggIssue(star, ldModel, issues);
};

const collectStarIssues = (
  config: SimulationConfigV4,
  star: StarBodyV4,
  index: number,
  ldModel: SnapshotLimbDarkeningModel | undefined,
  issues: string[],
): void => {
  collectStarRadiusIssue(star, issues);
  collectStarMassIssue(config, star, index, issues);
  collectDetachedBinaryStarIssues(config, star, ldModel, issues);
  collectOblatenessIssue(star, `star "${star.id}"`, issues);
};

const collectPlanetIssue = (planet: PlanetBodyV4, issues: string[]): void => {
  if (!isFinitePositive(planet.r)) {
    issues.push(`planet "${planet.id}" requires a finite positive radius`);
  }
  if (planet.m !== undefined && !isFiniteNonNegative(planet.m)) {
    issues.push(`planet "${planet.id}" mass must be finite and >= 0 when provided`);
  }
  collectOblatenessIssue(planet, `planet "${planet.id}"`, issues);
};

const collectMoonIssue = (moon: MoonBodyV4, issues: string[]): void => {
  if (!isFinitePositive(moon.r)) {
    issues.push(`moon "${moon.id}" requires a finite positive radius`);
  }
  if (moon.m !== undefined && !isFiniteNonNegative(moon.m)) {
    issues.push(`moon "${moon.id}" mass must be finite and >= 0 when provided`);
  }
  collectOblatenessIssue(moon, `moon "${moon.id}"`, issues);
};

const throwNativeInputIssues = (config: SimulationConfigV4, issues: string[]): void => {
  if (issues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "native-inputs",
      code: "SCB_INVALID_NATIVE_INPUTS",
      summary: "native snapshot inputs are invalid for scientific-browser execution",
      details: issues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
      },
    });
  }
};

export function assertScientificBrowserSnapshotInputs(config: SimulationConfigV4): void {
  if (!isScientificBrowserExecution(config)) return;

  const issues: string[] = [];
  const ldModel = config.photometry?.limbDarkeningModel;

  collectObserverIssues(config, issues);
  collectDetachedBinaryLimbDarkeningIssue(config, ldModel, issues);
  config.bodies.stars.forEach((star, index) => collectStarIssues(config, star, index, ldModel, issues));
  config.bodies.planets.forEach((planet) => collectPlanetIssue(planet, issues));
  config.bodies.moons.forEach((moon) => collectMoonIssue(moon, issues));
  throwNativeInputIssues(config, issues);
}

export function safeBodyRadius(body: StarBodyV4 | PlanetBodyV4 | MoonBodyV4): number {
  const r0 = finitePositiveOrDefault(body.r, 1);
  const obl = finiteOrDefault(body.shape?.oblateness, 0);
  if (!(obl > 0)) return r0;
  const f = Math.max(0.1, 1 - 0.5 * Math.min(0.9, obl));
  return r0 * f;
}

export function keplerOptionsForExecutionMode(
  executionMode: RuntimeExecutionModeV4 | undefined,
): SolveKeplerEOptions | undefined {
  if (executionMode !== "scientific-browser") return undefined;
  return { strict: true };
}

export function hierarchyParentMap(config: SimulationConfigV4): Map<string, string> {
  const out = new Map<string, string>();
  for (const link of config.orbits.hierarchy ?? []) {
    if (link.childId && link.parentId) out.set(link.childId, link.parentId);
  }
  return out;
}
