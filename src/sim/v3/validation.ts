/**
 * Owns validation support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import type { OrbitElements } from "../../core/types";
import type { SimulationConfigV3, TimeRange, ValidationIssue, ValidationReportV3 } from "./types";

const finite = (value: number | undefined): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const pushIssue = (issues: ValidationIssue[], path: string, message: string): void => {
  issues.push({ path, message });
};

const validatePositiveFiniteField = (
  issues: ValidationIssue[],
  path: string,
  value: number | undefined,
  message: string,
): void => {
  if (!finite(value) || value <= 0) pushIssue(issues, path, message);
};

const validateOptionalPositiveField = (
  issues: ValidationIssue[],
  path: string,
  value: number | undefined,
  message: string,
): void => {
  if (value !== undefined && (!finite(value) || value <= 0)) pushIssue(issues, path, message);
};

const validateOptionalNonNegativeField = (
  issues: ValidationIssue[],
  path: string,
  value: number | undefined,
  message: string,
): void => {
  if (value !== undefined && (!finite(value) || value < 0)) pushIssue(issues, path, message);
};

const validateFiniteField = (
  issues: ValidationIssue[],
  path: string,
  value: number | undefined,
  message: string,
): void => {
  if (!finite(value)) pushIssue(issues, path, message);
};

const validateEccentricity = (issues: ValidationIssue[], path: string, value: number | undefined): void => {
  if (!finite(value) || value < 0 || value >= 1) pushIssue(issues, path, "must be in [0, 1).");
};

const validateOrbit = (issues: ValidationIssue[], path: string, orbit: OrbitElements | undefined): void => {
  if (!orbit) {
    pushIssue(issues, path, "orbit is required.");
    return;
  }

  validatePositiveFiniteField(issues, `${path}.a`, orbit.a, "must be a finite number > 0.");
  validateEccentricity(issues, `${path}.e`, orbit.e);
  validateFiniteField(issues, `${path}.inc`, orbit.inc, "must be finite.");
  validateFiniteField(issues, `${path}.Omega`, orbit.Omega, "must be finite.");
  validateFiniteField(issues, `${path}.omega`, orbit.omega, "must be finite.");
  validatePositiveFiniteField(issues, `${path}.period`, orbit.period, "must be > 0.");
  validateFiniteField(issues, `${path}.t0`, orbit.t0, "must be finite.");
};

export function validateSimulationConfigV3(config: SimulationConfigV3): ValidationReportV3 {
  const issues: ValidationIssue[] = [];
  validateV3Version(issues, config);
  validateV3Observer(issues, config);
  validateV3Star(issues, config);
  validateV3Planet(issues, config);
  validateV3Moon(issues, config);
  validateV3NBody(issues, config);
  validateV3Photometry(issues, config);
  validateV3Didactics(issues, config);
  validateV3Rendering(issues, config);

  return {
    ok: issues.length === 0,
    issues,
  };
}

const validateV3Version = (issues: ValidationIssue[], config: SimulationConfigV3): void => {
  if (!config || config.version !== "3") {
    pushIssue(issues, "version", "must be the literal string '3'.");
  }
};

const validateV3Observer = (issues: ValidationIssue[], config: SimulationConfigV3): void => {
  const observer = config?.bodies?.observer?.dir;
  if (!observer || !finite(observer.x) || !finite(observer.y) || !finite(observer.z)) {
    pushIssue(issues, "bodies.observer.dir", "must be a finite vector.");
  } else if (Math.hypot(observer.x, observer.y, observer.z) === 0) {
    pushIssue(issues, "bodies.observer.dir", "must not be the zero vector.");
  }
};

const validateV3Star = (issues: ValidationIssue[], config: SimulationConfigV3): void => {
  const star = config?.bodies?.star;
  if (!star) {
    pushIssue(issues, "bodies.star", "is required.");
    return;
  }

  validatePositiveFiniteField(issues, "bodies.star.r", star.r, "must be a finite number > 0.");
  validateOptionalPositiveField(issues, "bodies.star.m", star.m, "must be > 0 when provided.");
};

const validateV3Planet = (issues: ValidationIssue[], config: SimulationConfigV3): void => {
  const planet = config?.bodies?.planet;
  if (!planet) {
    pushIssue(issues, "bodies.planet", "is required.");
    return;
  }

  validatePositiveFiniteField(issues, "bodies.planet.r", planet.r, "must be > 0.");
  validateOptionalNonNegativeField(issues, "bodies.planet.m", planet.m, "must be >= 0 when provided.");
  validateOrbit(issues, "bodies.planet.orbit", planet.orbit);
};

const validateV3Moon = (issues: ValidationIssue[], config: SimulationConfigV3): void => {
  const moon = config?.bodies?.moon;
  if (!moon) return;

  validatePositiveFiniteField(issues, "bodies.moon.r", moon.r, "must be > 0.");
  validateOptionalNonNegativeField(issues, "bodies.moon.m", moon.m, "must be >= 0 when provided.");
  validateOrbit(issues, "bodies.moon.orbitAroundPlanet", moon.orbitAroundPlanet);
};

const validateV3NBody = (issues: ValidationIssue[], config: SimulationConfigV3): void => {
  const nbody = config?.dynamics?.nbodyPlanetMoon;
  if (!nbody?.enabled) return;

  // Accept either muX or mX (mass-based fallback), mirroring resolveMuFromInputs in nbody/config.ts.
  validateV3NBodyMu(issues, "muStar", nbody.muStar, nbody.mStar);
  validateV3NBodyMu(issues, "muPlanet", nbody.muPlanet, nbody.mPlanet);
  validateV3NBodyMu(issues, "muMoon", nbody.muMoon, nbody.mMoon);
  validatePositiveFiniteField(
    issues,
    "dynamics.nbodyPlanetMoon.dtMax",
    nbody.dtMax,
    "must be > 0 when n-body is enabled.",
  );
};

const validateV3NBodyMu = (
  issues: ValidationIssue[],
  field: "muStar" | "muPlanet" | "muMoon",
  mu: number | undefined,
  mass: number | undefined,
): void => {
  if (hasPositiveFiniteValue(mu) || hasPositiveFiniteValue(mass)) return;
  pushIssue(
    issues,
    `dynamics.nbodyPlanetMoon.${field}`,
    `${field} or ${field.replace("mu", "m")} must be > 0 when n-body is enabled.`,
  );
};

const hasPositiveFiniteValue = (value: number | undefined): boolean => {
  return finite(value) && value > 0;
};

const validateV3Photometry = (issues: ValidationIssue[], config: SimulationConfigV3): void => {
  const baselineFlux = config?.photometry?.baselineFlux;
  if (baselineFlux !== undefined && (!finite(baselineFlux) || baselineFlux < 0)) {
    pushIssue(issues, "photometry.baselineFlux", "must be >= 0 when provided.");
  }
};

const validateV3Didactics = (issues: ValidationIssue[], config: SimulationConfigV3): void => {
  const didactics = config?.didactics;
  if (didactics?.enabled && didactics.curriculum && didactics.curriculum.length === 0) {
    pushIssue(issues, "didactics.curriculum", "must contain at least one lesson when provided.");
  }
};

const validateV3Rendering = (issues: ValidationIssue[], config: SimulationConfigV3): void => {
  const rendering = config?.rendering;
  if (!rendering) return;

  validateOptionalEnum(issues, "rendering.overlayDensity", rendering.overlayDensity, [
    "low",
    "medium",
    "high",
  ]);
  validateOptionalEnum(issues, "rendering.physicsVisibility", rendering.physicsVisibility, [
    "minimal",
    "balanced",
    "full",
  ]);
  validateOptionalEnum(issues, "rendering.didacticMode", rendering.didacticMode, ["scientific", "didactic"]);
};

const validateOptionalEnum = (
  issues: ValidationIssue[],
  path: string,
  value: string | undefined,
  allowed: string[],
): void => {
  if (value === undefined || allowed.includes(value)) return;
  pushIssue(issues, path, `must be one of: ${allowed.join(", ")}.`);
};

export function assertValidSimulationConfigV3(config: SimulationConfigV3): void {
  const report = validateSimulationConfigV3(config);
  if (report.ok) return;

  const details = report.issues.map((x) => `${x.path}: ${x.message}`).join(" | ");
  throw new Error(`SimulationConfigV3 validation failed: ${details}`);
}

export function assertValidTimeRange(range: TimeRange): void {
  const validFinite =
    Number.isFinite(range.startSec) && Number.isFinite(range.endSec) && Number.isFinite(range.stepSec);
  if (!validFinite) {
    throw new Error("TimeRange is invalid: startSec/endSec/stepSec must be finite.");
  }
  if (!(range.stepSec > 0)) {
    throw new Error("TimeRange is invalid: stepSec must be > 0.");
  }
  if (range.endSec < range.startSec) {
    throw new Error("TimeRange is invalid: endSec must be >= startSec.");
  }
}
