import type { OrbitElements } from "../../core/types";
import type { SimulationConfigV3, TimeRange, ValidationIssue, ValidationReportV3 } from "./types";

function finite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pushIssue(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function validateOrbit(issues: ValidationIssue[], path: string, orbit: OrbitElements | undefined): void {
  if (!orbit) {
    pushIssue(issues, path, "orbit is required.");
    return;
  }

  if (!finite(orbit.a) || orbit.a <= 0) pushIssue(issues, `${path}.a`, "must be a finite number > 0.");
  if (!finite(orbit.e) || orbit.e < 0 || orbit.e >= 1) pushIssue(issues, `${path}.e`, "must be in [0, 1).");
  if (!finite(orbit.inc)) pushIssue(issues, `${path}.inc`, "must be finite.");
  if (!finite(orbit.Omega)) pushIssue(issues, `${path}.Omega`, "must be finite.");
  if (!finite(orbit.omega)) pushIssue(issues, `${path}.omega`, "must be finite.");
  if (!finite(orbit.period) || orbit.period <= 0) pushIssue(issues, `${path}.period`, "must be > 0.");
  if (!finite(orbit.t0)) pushIssue(issues, `${path}.t0`, "must be finite.");
}

export function validateSimulationConfigV3(config: SimulationConfigV3): ValidationReportV3 {
  const issues: ValidationIssue[] = [];

  if (!config || config.version !== "3") {
    pushIssue(issues, "version", "must be the literal string '3'.");
  }

  const observer = config?.bodies?.observer?.dir;
  if (!observer || !finite(observer.x) || !finite(observer.y) || !finite(observer.z)) {
    pushIssue(issues, "bodies.observer.dir", "must be a finite vector.");
  } else if (Math.hypot(observer.x, observer.y, observer.z) === 0) {
    pushIssue(issues, "bodies.observer.dir", "must not be the zero vector.");
  }

  const star = config?.bodies?.star;
  if (!star) {
    pushIssue(issues, "bodies.star", "is required.");
  } else {
    if (!finite(star.r) || star.r <= 0) pushIssue(issues, "bodies.star.r", "must be a finite number > 0.");
    if (star.m !== undefined && (!finite(star.m) || star.m <= 0)) {
      pushIssue(issues, "bodies.star.m", "must be > 0 when provided.");
    }
  }

  const planet = config?.bodies?.planet;
  if (!planet) {
    pushIssue(issues, "bodies.planet", "is required.");
  } else {
    if (!finite(planet.r) || planet.r <= 0) pushIssue(issues, "bodies.planet.r", "must be > 0.");
    if (planet.m !== undefined && (!finite(planet.m) || planet.m < 0)) {
      pushIssue(issues, "bodies.planet.m", "must be >= 0 when provided.");
    }
    validateOrbit(issues, "bodies.planet.orbit", planet.orbit);
  }

  const moon = config?.bodies?.moon;
  if (moon) {
    if (!finite(moon.r) || moon.r <= 0) pushIssue(issues, "bodies.moon.r", "must be > 0.");
    if (moon.m !== undefined && (!finite(moon.m) || moon.m < 0)) {
      pushIssue(issues, "bodies.moon.m", "must be >= 0 when provided.");
    }
    validateOrbit(issues, "bodies.moon.orbitAroundPlanet", moon.orbitAroundPlanet);
  }

  const nbody = config?.dynamics?.nbodyPlanetMoon;
  if (nbody?.enabled) {
    // Accept either muX or mX (mass-based fallback), mirroring resolveMuFromInputs in nbody/config.ts.
    const hasValidMuStar = (finite(nbody.muStar) && nbody.muStar > 0) || (finite(nbody.mStar) && nbody.mStar > 0);
    if (!hasValidMuStar) {
      pushIssue(issues, "dynamics.nbodyPlanetMoon.muStar", "muStar or mStar must be > 0 when n-body is enabled.");
    }
    const hasValidMuPlanet =
      (finite(nbody.muPlanet) && nbody.muPlanet > 0) || (finite(nbody.mPlanet) && nbody.mPlanet > 0);
    if (!hasValidMuPlanet) {
      pushIssue(issues, "dynamics.nbodyPlanetMoon.muPlanet", "muPlanet or mPlanet must be > 0 when n-body is enabled.");
    }
    const hasValidMuMoon = (finite(nbody.muMoon) && nbody.muMoon > 0) || (finite(nbody.mMoon) && nbody.mMoon > 0);
    if (!hasValidMuMoon) {
      pushIssue(issues, "dynamics.nbodyPlanetMoon.muMoon", "muMoon or mMoon must be > 0 when n-body is enabled.");
    }
    if (!finite(nbody.dtMax) || nbody.dtMax <= 0) {
      pushIssue(issues, "dynamics.nbodyPlanetMoon.dtMax", "must be > 0 when n-body is enabled.");
    }
  }

  const baselineFlux = config?.photometry?.baselineFlux;
  if (baselineFlux !== undefined && (!finite(baselineFlux) || baselineFlux < 0)) {
    pushIssue(issues, "photometry.baselineFlux", "must be >= 0 when provided.");
  }

  const didactics = config?.didactics;
  if (didactics?.enabled && didactics.curriculum && didactics.curriculum.length === 0) {
    pushIssue(issues, "didactics.curriculum", "must contain at least one lesson when provided.");
  }

  const rendering = config?.rendering;
  if (rendering) {
    const overlayDensityOk =
      rendering.overlayDensity === undefined || ["low", "medium", "high"].includes(rendering.overlayDensity);
    if (!overlayDensityOk) {
      pushIssue(issues, "rendering.overlayDensity", "must be one of: low, medium, high.");
    }

    const physicsVisibilityOk =
      rendering.physicsVisibility === undefined ||
      ["minimal", "balanced", "full"].includes(rendering.physicsVisibility);
    if (!physicsVisibilityOk) {
      pushIssue(issues, "rendering.physicsVisibility", "must be one of: minimal, balanced, full.");
    }

    const didacticModeOk =
      rendering.didacticMode === undefined || ["scientific", "didactic"].includes(rendering.didacticMode);
    if (!didacticModeOk) {
      pushIssue(issues, "rendering.didacticMode", "must be one of: scientific, didactic.");
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

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
