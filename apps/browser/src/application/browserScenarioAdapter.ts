/** Converts mutable browser authoring state into the canonical Education V4 scenario. */
import type { BinaryStarPhotometryParams, BrowserScenarioDraft } from "../domain/model/types";
import { mapBrowserScenarioDraftToEducationScenarioV4 } from "../domain/simulation/v4";
import type { EducationScenarioV4, RuntimeExecutionModeV4, RuntimeModeV4 } from "../domain/simulation/v4";
import { collectUnsupportedPhotometryFeaturesV4 } from "../domain/simulation/v4/migrate";
import { sanitizeStaticOrbit } from "../domain/simulation/v4/orbitSanitizer";
import { createScientificBrowserRuntimeError } from "../domain/simulation/v4/scientificErrors";
import type { BinaryLabConfigV4 } from "../domain/simulation/v4/types";
import { assertOrbit } from "../domain/simulation/validation/assertions";

export type BrowserScenarioAuthoringInput = {
  system: BrowserScenarioDraft;
  binaryMode: boolean;
  runtimeMode: RuntimeModeV4;
  executionMode?: RuntimeExecutionModeV4;
  binaryLabDefaults?: BinaryLabConfigV4;
};

function binaryLuminosityScale(source: BinaryStarPhotometryParams, fallbackLuminosityScale: number): number {
  if (!Number.isFinite(source.luminosityScale)) return fallbackLuminosityScale;
  return Math.max(0, source.luminosityScale as number);
}

function copyFiniteBinaryStarParams(
  out: BinaryStarPhotometryParams,
  source: BinaryStarPhotometryParams,
): void {
  if (Number.isFinite(source.teffK)) out.teffK = source.teffK;
  if (Number.isFinite(source.loggCgs)) out.loggCgs = source.loggCgs;
  if (Number.isFinite(source.metallicityDex)) out.metallicityDex = source.metallicityDex;
}

function nonEmptyPassband(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function mergeBinaryStarPhotometry(args: {
  legacy: BinaryStarPhotometryParams | undefined;
  fallbackPassband?: string;
  fallbackLuminosityScale: number;
}): BinaryStarPhotometryParams {
  const source = args.legacy ?? {};
  const out: BinaryStarPhotometryParams = {
    luminosityScale: binaryLuminosityScale(source, args.fallbackLuminosityScale),
  };
  copyFiniteBinaryStarParams(out, source);
  const passband = nonEmptyPassband(source.passband) ?? nonEmptyPassband(args.fallbackPassband);
  if (passband) out.passband = passband;
  return out;
}

function collectScientificBrowserDraftOrbitIssues(args: { orbit: unknown; name: string }): string[] {
  if (typeof args.orbit === "function") {
    return [`${args.name} must be a static orbit object in scientific-browser mode`];
  }
  if (!args.orbit || typeof args.orbit !== "object") {
    return [`${args.name} must be provided as static orbit elements in scientific-browser mode`];
  }
  try {
    assertOrbit(args.orbit as Parameters<typeof assertOrbit>[0], args.name);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

function assertScientificBrowserDraftInputs(args: BrowserScenarioAuthoringInput): void {
  if (args.executionMode !== "scientific-browser") return;
  const details = collectScientificBrowserDraftOrbitIssues({
    orbit: args.system.planet.orbit,
    name: args.binaryMode ? "system.planet.orbit (binary orbit)" : "system.planet.orbit",
  });
  if (!args.binaryMode && args.system.moon) {
    details.push(
      ...collectScientificBrowserDraftOrbitIssues({
        orbit: args.system.moon.orbitAroundPlanet,
        name: "system.moon.orbitAroundPlanet",
      }),
    );
  }
  if (args.binaryMode) {
    const primaryPassband = args.system.binaryStars?.primary?.passband;
    const secondaryPassband = args.system.binaryStars?.secondary?.passband;
    if (!(typeof primaryPassband === "string" && primaryPassband.trim().length > 0)) {
      details.push(
        "system.binaryStars.primary.passband must be explicit in detached-binary scientific-browser mode",
      );
    }
    if (!(typeof secondaryPassband === "string" && secondaryPassband.trim().length > 0)) {
      details.push(
        "system.binaryStars.secondary.passband must be explicit in detached-binary scientific-browser mode",
      );
    }
  }
  if (details.length === 0) return;
  const binaryPassbandOnly = details.every((detail) => detail.includes(".passband must be explicit"));
  throw createScientificBrowserRuntimeError({
    stage: "config",
    code: binaryPassbandOnly ? "SCB_BINARY_IMPLICIT_PASSBAND" : "SCB_INVALID_LEGACY_ORBIT",
    summary: binaryPassbandOnly
      ? "detached-binary drafts cannot rely on global passband fallback in scientific-browser mode"
      : "BrowserScenarioDraft orbit input cannot be losslessly mapped into scientific-browser runtime",
    details,
    context: {
      executionMode: args.executionMode,
      runtimeMode: args.runtimeMode,
      binaryMode: args.binaryMode,
    },
  });
}

/**
 * The Browser authoring boundary that validates mutable BrowserScenarioDraft into
 * a canonical, serializable EducationScenarioV4. Scientific-browser checks run
 * before mapping so unsupported draft input cannot be sanitized away.
 */
export function toEducationScenarioV4(args: BrowserScenarioAuthoringInput): EducationScenarioV4 {
  assertScientificBrowserDraftInputs(args);
  const cfg = mapBrowserScenarioDraftToEducationScenarioV4(args.system);
  cfg.runtime = {
    ...(cfg.runtime ?? {}),
    mode: args.runtimeMode,
    executionMode: args.executionMode ?? cfg.runtime?.executionMode ?? "interactive",
  };
  if (!args.binaryMode) return cfg;

  const binaryFallback = cfg.orbits.binary;
  const fallbackPassband = args.system.star?.photometry?.limbDarkeningModel?.bandpass;
  const primaryBinaryPhotometry = mergeBinaryStarPhotometry({
    legacy: {
      teffK: args.system.star?.photometry?.limbDarkeningModel?.stellar?.teffK,
      loggCgs: args.system.star?.photometry?.limbDarkeningModel?.stellar?.loggCgs,
      metallicityDex: args.system.star?.photometry?.limbDarkeningModel?.stellar?.metallicityDex,
      passband: fallbackPassband,
      ...args.system.binaryStars?.primary,
    },
    fallbackPassband,
    fallbackLuminosityScale: 1,
  });
  const secondaryBinaryPhotometry = mergeBinaryStarPhotometry({
    legacy: args.system.binaryStars?.secondary,
    fallbackPassband,
    fallbackLuminosityScale: Number.isFinite(args.system.star?.photometry?.phaseCurve?.constant)
      ? Math.max(0, args.system.star.photometry?.phaseCurve?.constant as number)
      : 0.3,
  });
  cfg.mode = "detached-binary-lab";
  cfg.binaryLab = { ...(args.binaryLabDefaults ?? {}) };
  cfg.bodies.stars = [
    {
      ...cfg.bodies.stars[0],
      r: args.system.star.r,
      m: args.system.star.m,
      shape: args.system.star.shape,
      rings: args.system.star.rings,
      spin: args.system.star.spin,
      gravityHarmonics: args.system.star.gravityHarmonics,
      tides: args.system.star.tides,
      ...primaryBinaryPhotometry,
    },
    {
      ...cfg.bodies.stars[1],
      r: args.system.planet.r,
      m: args.system.planet.m,
      shape: args.system.planet.shape,
      rings: args.system.planet.rings,
      spin: args.system.planet.spin,
      gravityHarmonics: args.system.planet.gravityHarmonics,
      tides: args.system.planet.tides,
      ...secondaryBinaryPhotometry,
    },
  ];
  cfg.orbits.binary = sanitizeStaticOrbit(args.system.planet.orbit, binaryFallback);
  cfg.bodies.planets = [];
  cfg.bodies.moons = [];
  cfg.orbits.hierarchy = [];
  return cfg;
}

export function unsupportedEducationScenarioFeatures(scenario: EducationScenarioV4): string[] {
  return collectUnsupportedPhotometryFeaturesV4(scenario);
}
