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

function finitePositiveOrDefault(x: unknown, d: number): number {
  const v = finiteOrDefault(x, d);
  return v > 0 ? v : d;
}

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

export function assertScientificBrowserSnapshotInputs(config: SimulationConfigV4): void {
  if (config.runtime?.executionMode !== "scientific-browser") return;

  const issues: string[] = [];
  const hasExplicitPassband = (passband: unknown): boolean =>
    typeof passband === "string" && passband.trim().length > 0;
  const collectOblatenessIssue = (
    body: { id: string; shape?: { oblateness?: number } } | undefined,
    name: string,
  ): void => {
    const oblateness = body?.shape?.oblateness;
    if (oblateness === undefined) return;
    if (!(Number.isFinite(oblateness) && oblateness >= 0 && oblateness < 1)) {
      issues.push(`${name} shape.oblateness must be finite and in [0,1) when provided`);
    }
  };
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

  const ldModel = config.photometry?.limbDarkeningModel;
  if (config.mode === "detached-binary-lab" && !ldModel) {
    issues.push("photometry.limbDarkeningModel must be defined in detached-binary scientific-browser mode");
  }

  for (const star of config.bodies.stars) {
    if (!(Number.isFinite(star.r) && star.r > 0)) {
      issues.push(`star "${star.id}" requires a finite positive radius`);
    }
    if (!(Number.isFinite(star.m) && (star.m as number) > 0)) {
      issues.push(`star "${star.id}" requires a finite positive mass`);
    }
    if (
      config.mode === "detached-binary-lab" &&
      !(Number.isFinite(star.teffK) && (star.teffK as number) > 0)
    ) {
      issues.push(
        `star "${star.id}" must define a finite positive teffK in detached-binary scientific-browser mode`,
      );
    }
    if (config.mode === "detached-binary-lab" && !hasExplicitPassband(star.passband)) {
      issues.push(
        `star "${star.id}" must define an explicit passband in detached-binary scientific-browser mode`,
      );
    } else if (config.mode === "detached-binary-lab" && !isSupportedStellarPassband(star.passband)) {
      issues.push(
        `star "${star.id}" passband "${String(star.passband)}" is not supported by the bounded scientific photometry path`,
      );
    }
    if (
      config.mode === "detached-binary-lab" &&
      ldModel &&
      !hasExplicitLimbDarkeningBandLaw(ldModel, star.passband) &&
      !(Number.isFinite(star.loggCgs) && (star.loggCgs as number) > 0)
    ) {
      issues.push(
        `star "${star.id}" must define a finite positive loggCgs when photometry.limbDarkeningModel has no explicit law for passband "${String(star.passband)}" in detached-binary scientific-browser mode`,
      );
    }
    collectOblatenessIssue(star, `star "${star.id}"`);
  }

  for (const planet of config.bodies.planets) {
    if (!(Number.isFinite(planet.r) && planet.r > 0)) {
      issues.push(`planet "${planet.id}" requires a finite positive radius`);
    }
    if (planet.m !== undefined && !(Number.isFinite(planet.m) && planet.m >= 0)) {
      issues.push(`planet "${planet.id}" mass must be finite and >= 0 when provided`);
    }
    collectOblatenessIssue(planet, `planet "${planet.id}"`);
  }

  for (const moon of config.bodies.moons) {
    if (!(Number.isFinite(moon.r) && moon.r > 0)) {
      issues.push(`moon "${moon.id}" requires a finite positive radius`);
    }
    if (moon.m !== undefined && !(Number.isFinite(moon.m) && moon.m >= 0)) {
      issues.push(`moon "${moon.id}" mass must be finite and >= 0 when provided`);
    }
    collectOblatenessIssue(moon, `moon "${moon.id}"`);
  }

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
