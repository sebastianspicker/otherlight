/**
 * Owns v4Runtime support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { BinaryStarPhotometryParams, SystemParams } from "../core/types";
import { cloneParams } from "../core/clone";
import { createSimulationV4, migrateSystemParamsToV4 } from "../sim/v4";
import type { RuntimeExecutionModeV4, RuntimeModeV4, SimulationConfigV4 } from "../sim/v4";
import { collectUnsupportedPhotometryFeaturesV4 } from "../sim/v4/migrate";
import type { BinaryLabConfigV4 } from "../sim/v4/types";
import { sanitizeStaticOrbit } from "../sim/v4/orbitSanitizer";
import { assertOrbit } from "../sim/validation/assertions";
import { createReferenceSimulationV4, type SimulationRuntimeV4WithDispose } from "../sim/v4/referenceClient";
import { createScientificBrowserRuntimeError } from "../sim/v4/scientificErrors";

export type AppSimulationRuntime = SimulationRuntimeV4WithDispose;

// Boundary for callers that still pass the older SystemParams shape into V4 setup.
export function cloneParamsForV4Runtime(system: SystemParams): SystemParams {
  return cloneParams(system);
}

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

function mergedBinaryPassband(
  source: BinaryStarPhotometryParams,
  fallbackPassband: string | undefined,
): string | undefined {
  return nonEmptyPassband(source.passband) ?? nonEmptyPassband(fallbackPassband);
}

function mergeBinaryStarPhotometry(args: {
  legacy: BinaryStarPhotometryParams | undefined;
  fallbackPassband?: string;
  fallbackLuminosityScale: number;
}): BinaryStarPhotometryParams {
  const { legacy, fallbackPassband, fallbackLuminosityScale } = args;
  const source = legacy ?? {};
  const out: BinaryStarPhotometryParams = {
    luminosityScale: binaryLuminosityScale(source, fallbackLuminosityScale),
  };
  copyFiniteBinaryStarParams(out, source);
  const passband = mergedBinaryPassband(source, fallbackPassband);
  if (passband) out.passband = passband;
  return out;
}

function collectScientificBrowserLegacyOrbitIssues(args: { orbit: unknown; name: string }): string[] {
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

function assertScientificBrowserLegacyMigrationInputs(args: {
  system: SystemParams;
  binaryMode: boolean;
  runtimeMode: RuntimeModeV4;
  executionMode?: RuntimeExecutionModeV4;
}): void {
  if (args.executionMode !== "scientific-browser") return;

  const details = collectScientificBrowserLegacyOrbitIssues({
    orbit: args.system.planet.orbit,
    name: args.binaryMode ? "system.planet.orbit (binary orbit)" : "system.planet.orbit",
  });
  if (!args.binaryMode && args.system.moon) {
    details.push(
      ...collectScientificBrowserLegacyOrbitIssues({
        orbit: args.system.moon.orbitAroundPlanet,
        name: "system.moon.orbitAroundPlanet",
      }),
    );
  }

  if (details.length === 0) return;

  throw createScientificBrowserRuntimeError({
    stage: "config",
    code: "SCB_INVALID_LEGACY_ORBIT",
    summary: "legacy SystemParams orbit input cannot be losslessly migrated into scientific-browser runtime",
    details,
    context: {
      executionMode: args.executionMode,
      runtimeMode: args.runtimeMode,
      binaryMode: args.binaryMode,
    },
  });
}

function assertScientificBrowserLegacyBinaryPhotometryInputs(args: {
  system: SystemParams;
  binaryMode: boolean;
  runtimeMode: RuntimeModeV4;
  executionMode?: RuntimeExecutionModeV4;
}): void {
  if (args.executionMode !== "scientific-browser" || !args.binaryMode) return;

  const details: string[] = [];
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

  if (details.length === 0) return;

  throw createScientificBrowserRuntimeError({
    stage: "config",
    code: "SCB_BINARY_IMPLICIT_PASSBAND",
    summary:
      "legacy detached-binary inputs cannot rely on global passband fallback in scientific-browser mode",
    details,
    context: {
      executionMode: args.executionMode,
      runtimeMode: args.runtimeMode,
      binaryMode: args.binaryMode,
    },
  });
}

function buildSimulationConfigV4FromParams(args: {
  system: SystemParams;
  binaryMode: boolean;
  runtimeMode: RuntimeModeV4;
  executionMode?: RuntimeExecutionModeV4;
  binaryLabDefaults?: BinaryLabConfigV4;
}): SimulationConfigV4 {
  const { system, binaryMode, runtimeMode, executionMode, binaryLabDefaults } = args;
  assertScientificBrowserLegacyMigrationInputs({ system, binaryMode, runtimeMode, executionMode });
  assertScientificBrowserLegacyBinaryPhotometryInputs({ system, binaryMode, runtimeMode, executionMode });
  const cfg = migrateSystemParamsToV4(system);
  cfg.runtime = {
    ...(cfg.runtime ?? {}),
    mode: runtimeMode,
    executionMode: executionMode ?? cfg.runtime?.executionMode ?? "interactive",
  };

  if (!binaryMode) return cfg;

  const binaryFallback = cfg.orbits.binary;
  const fallbackPassband = system.star?.photometry?.limbDarkeningModel?.bandpass;
  const primaryBinaryPhotometry = mergeBinaryStarPhotometry({
    legacy: {
      teffK: system.star?.photometry?.limbDarkeningModel?.stellar?.teffK,
      loggCgs: system.star?.photometry?.limbDarkeningModel?.stellar?.loggCgs,
      metallicityDex: system.star?.photometry?.limbDarkeningModel?.stellar?.metallicityDex,
      passband: fallbackPassband,
      ...system.binaryStars?.primary,
    },
    fallbackPassband,
    fallbackLuminosityScale: 1,
  });
  const secondaryBinaryPhotometry = mergeBinaryStarPhotometry({
    legacy: system.binaryStars?.secondary,
    fallbackPassband,
    fallbackLuminosityScale: Number.isFinite(system.star?.photometry?.phaseCurve?.constant)
      ? Math.max(0, system.star.photometry?.phaseCurve?.constant as number)
      : 0.3,
  });
  cfg.mode = "detached-binary-lab";
  cfg.binaryLab = { ...(binaryLabDefaults ?? {}) };
  cfg.bodies.stars = [
    {
      ...cfg.bodies.stars[0],
      r: system.star.r,
      m: system.star.m,
      shape: system.star.shape,
      rings: system.star.rings,
      spin: system.star.spin,
      gravityHarmonics: system.star.gravityHarmonics,
      tides: system.star.tides,
      ...primaryBinaryPhotometry,
    },
    {
      ...cfg.bodies.stars[1],
      r: system.planet.r,
      m: system.planet.m,
      shape: system.planet.shape,
      rings: system.planet.rings,
      spin: system.planet.spin,
      gravityHarmonics: system.planet.gravityHarmonics,
      tides: system.planet.tides,
      ...secondaryBinaryPhotometry,
    },
  ];
  cfg.orbits.binary = sanitizeStaticOrbit(system.planet.orbit, binaryFallback);
  cfg.bodies.planets = [];
  cfg.bodies.moons = [];
  cfg.orbits.hierarchy = [];
  return cfg;
}

export function createSimulationRuntimeV4FromParams(args: {
  system: SystemParams;
  binaryMode: boolean;
  runtimeMode: RuntimeModeV4;
  executionMode?: RuntimeExecutionModeV4;
  binaryLabDefaults?: BinaryLabConfigV4;
}): AppSimulationRuntime {
  // All UI paths enter the runtime through this adapter. It is intentionally the
  // only place that turns legacy SystemParams plus UI mode into a V4 config.
  const cfg = buildSimulationConfigV4FromParams(args);
  const unsupportedFeatures = collectUnsupportedPhotometryFeaturesV4(cfg);
  let pendingStatusMessage =
    unsupportedFeatures.length > 0
      ? `V4 runtime does not support: ${unsupportedFeatures.join(", ")}.`
      : undefined;

  const takeStatusMessage = (delegate?: () => string | undefined): string | undefined => {
    if (pendingStatusMessage) {
      const message = pendingStatusMessage;
      pendingStatusMessage = undefined;
      return message;
    }
    return delegate?.();
  };

  if (args.runtimeMode === "reference") {
    const runtime = createReferenceSimulationV4(cfg);
    return {
      ...runtime,
      takeStatusMessage: () => takeStatusMessage(runtime.takeStatusMessage),
    };
  }
  const rt = createSimulationV4(cfg);
  return {
    ...rt,
    dispose: () => {},
    takeStatusMessage: () => takeStatusMessage(),
  };
}
