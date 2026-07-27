/**
 * Owns scientific Browser Config support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import { hasExplicitLimbDarkeningBandLaw } from "../../photometry/limbDarkening";
import {
  isSupportedStellarPassband,
  resolveDetachedBinaryLuminosities,
} from "../../photometry/stellarBandFlux";
import {
  createScientificBrowserRuntimeError,
  type ScientificBrowserFailureCode,
  type ScientificBrowserFailureContext,
} from "./scientificErrors";
import {
  collectScientificBrowserNBodyIssues,
  collectScientificBrowserOrbitIssues,
  collectScientificBrowserRelativityIssues,
} from "./scientificBrowserDynamicsConfig";
import {
  collectScientificBrowserActiveAdditiveChannelIssues,
  collectScientificBrowserAdditiveDeclarationIssues,
  collectScientificBrowserAdditiveExecutionIssues,
  collectScientificBrowserRtInputIssues,
  collectScientificBrowserRtLayerIssues,
  collectScientificBrowserStellarSurfaceIssues,
  collectScientificBrowserTransmissionIssues,
  collectScientificBrowserUnsupportedRtFeatureIssues,
  collectScientificBrowserUnsupportedTransmissionModelIssues,
} from "./scientificBrowserPhotometryConfig";
import type { SimulationConfigV4, StarBodyV4 } from "./types";

function isFiniteIntegerInRange(x: unknown, min: number, max: number): boolean {
  return typeof x === "number" && Number.isFinite(x) && Number.isInteger(x) && x >= min && x <= max;
}

function hasExplicitPassband(passband: unknown): boolean {
  return typeof passband === "string" && passband.trim().length > 0;
}

export function assertScientificBrowserConfig(config: SimulationConfigV4): void {
  if (config.runtime?.executionMode !== "scientific-browser") return;

  assertScientificBrowserAdditiveConfig(config);
  assertScientificBrowserTransmissionConfig(config);
  assertScientificBrowserRuntimeConfig(config);
  assertScientificBrowserDynamicsConfig(config);
  if (config.mode !== "detached-binary-lab") return;
  assertDetachedBinaryScientificConfig(config);
}

function assertScientificBrowserAdditiveConfig(config: SimulationConfigV4): void {
  const additiveChannelIssues = collectScientificBrowserActiveAdditiveChannelIssues(config.photometry);
  throwConfigIssues(
    collectScientificBrowserAdditiveDeclarationIssues(config.photometry, additiveChannelIssues),
    "SCB_ADDITIVE_FLUX_INVALID_CONFIG",
    "scientific-browser additive photometry requires an explicit higher-fidelity composition declaration",
    runtimeContext(config),
  );
  throwConfigIssues(
    collectScientificBrowserAdditiveExecutionIssues(config),
    "SCB_ADDITIVE_FLUX_INVALID_CONFIG",
    "scientific-browser additive photometry requires executable native geometry for the declared higher-fidelity branch",
    runtimeContext(config),
  );
}

function assertScientificBrowserTransmissionConfig(config: SimulationConfigV4): void {
  throwConfigIssues(
    collectScientificBrowserUnsupportedTransmissionModelIssues(config),
    "SCB_TRANSMISSION_MODEL_UNSUPPORTED",
    "scientific-browser native transmission currently supports atmosphereRT only; atmosphereTransmission is still unsupported",
    runtimeContext(config),
  );

  throwConfigIssues(
    collectScientificBrowserUnsupportedRtFeatureIssues(config),
    "SCB_TRANSMISSION_RT_FEATURE_UNSUPPORTED",
    "scientific-browser native atmosphereRT currently supports only attenuation layers, not emission, scattering, or temperature-profile RT controls",
    runtimeContext(config),
  );

  throwConfigIssues(
    collectScientificBrowserRtInputIssues(config),
    "SCB_TRANSMISSION_RT_INVALID_INPUTS",
    "scientific-browser native atmosphereRT requires explicit finite gray attenuation inputs",
    runtimeContext(config),
  );

  throwConfigIssues(
    collectScientificBrowserRtLayerIssues(config),
    "SCB_TRANSMISSION_RT_NO_VALID_LAYERS",
    "scientific-browser native atmosphereRT requires at least one valid attenuation layer",
    runtimeContext(config),
  );

  throwConfigIssues(
    collectScientificBrowserTransmissionIssues(config),
    "SCB_TRANSMISSION_MIXED_SHAPE",
    "scientific-browser atmospheric transmission currently supports only circle-only transmission geometries",
    runtimeContext(config),
  );
}

function assertScientificBrowserRuntimeConfig(config: SimulationConfigV4): void {
  if (hasInvalidReferenceSubsteps(config)) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_INVALID_REFERENCE_SUBSTEPS",
      summary: "runtime.referenceSubsteps is invalid for scientific-browser reference mode",
      details: ['runtime.referenceSubsteps must be an integer in [1,25] when runtime.mode === "reference"'],
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
        referenceSubsteps: String(config.runtime?.referenceSubsteps ?? "undefined"),
      },
    });
  }
}

function hasInvalidReferenceSubsteps(config: SimulationConfigV4): boolean {
  if (config.runtime?.mode !== "reference") return false;
  return !isFiniteIntegerInRange(config.runtime?.referenceSubsteps, 1, 25);
}

function assertScientificBrowserDynamicsConfig(config: SimulationConfigV4): void {
  const exomoonTimingShape = config.dynamics?.exomoonTimingShape;
  if (exomoonTimingShape?.tRef !== undefined && !Number.isFinite(exomoonTimingShape.tRef)) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_INVALID_TIMING_REFERENCE",
      summary: "scientific-browser mode requires a finite exomoon timing reference epoch",
      details: ["dynamics.exomoonTimingShape.tRef must be finite when provided"],
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
        mode: config.mode,
      },
    });
  }

  throwConfigIssues(
    collectScientificBrowserStellarSurfaceIssues(config.photometry),
    "SCB_INVALID_STELLAR_SURFACE",
    "scientific-browser mode requires explicit finite stellar-surface variability controls",
    modeContext(config),
  );

  throwConfigIssues(
    collectScientificBrowserRelativityIssues(config),
    "SCB_INVALID_RELATIVITY_CONFIG",
    "scientific-browser relativity requires explicit model and solver controls",
    modeContext(config),
  );

  if (config.dynamics?.relativity?.enabled) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_RELATIVITY_UNAVAILABLE",
      summary: "scientific-browser V4 does not execute LTTE, Shapiro, or force-level relativistic dynamics",
      details: [
        "use the V5 local scientific backend for research timing and relativity",
        "V4 may not return a scientific result for a configured solver that it does not run",
      ],
      context: modeContext(config),
    });
  }

  throwConfigIssues(
    collectScientificBrowserNBodyIssues(config),
    "SCB_INVALID_NBODY_CONFIG",
    "scientific-browser nbodyPlanetMoon requires explicit physical mass inputs",
    modeContext(config),
  );

  if (config.dynamics?.nbodyPlanetMoon?.enabled) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_NBODY_UNAVAILABLE",
      summary: "scientific-browser V4 builds Kepler snapshots and does not execute nbodyPlanetMoon",
      details: [
        "use the V5 local scientific backend for research N-body integration",
        "V4 may not label configuration presence as executed N-body physics",
      ],
      context: modeContext(config),
    });
  }

  throwConfigIssues(
    collectScientificBrowserOrbitIssues(config),
    "SCB_INVALID_ORBIT",
    "scientific-browser mode requires semantically valid static orbit elements",
    modeContext(config),
  );
}

function assertDetachedBinaryScientificConfig(config: SimulationConfigV4): void {
  const [primary, secondary] = config.bodies.stars;
  const issues = collectDetachedBinaryIssues(config);
  throwConfigIssues(
    issues.stellarInputIssues,
    "SCB_BINARY_INVALID_STELLAR_INPUTS",
    "detached-binary scientific-browser mode requires explicit stellar photometry inputs",
    runtimeContext(config),
  );
  throwConfigIssues(
    issues.passbandIssues,
    "SCB_BINARY_IMPLICIT_PASSBAND",
    "detached-binary scientific-browser mode rejects implicit passband fallback",
    runtimeContext(config),
  );
  throwConfigIssues(
    issues.unsupportedPassbandIssues,
    "SCB_BINARY_UNSUPPORTED_PASSBAND",
    "detached-binary scientific-browser mode requires supported explicit passbands",
    runtimeContext(config),
  );
  throwConfigIssues(
    issues.limbDarkeningIssues,
    "SCB_BINARY_LIMB_DARKENING_FALLBACK",
    "detached-binary scientific-browser mode requires star-specific eclipse surface-brightness inputs",
    runtimeContext(config),
  );
  assertDetachedBinaryPhysicalBandpass(config, primary, secondary);
}

type BinaryScienceIssues = {
  passbandIssues: string[];
  unsupportedPassbandIssues: string[];
  stellarInputIssues: string[];
  limbDarkeningIssues: string[];
};

type LimbDarkeningModelConfig = Parameters<typeof hasExplicitLimbDarkeningBandLaw>[0];

function collectDetachedBinaryIssues(config: SimulationConfigV4): BinaryScienceIssues {
  const issues = emptyBinaryScienceIssues();
  const ldModel = config.photometry?.limbDarkeningModel;
  if (!ldModel) {
    issues.limbDarkeningIssues.push(
      "photometry.limbDarkeningModel must be defined in detached-binary scientific-browser mode",
    );
  }
  for (const star of config.bodies.stars) {
    collectDetachedBinaryStarIssues(star, ldModel, issues);
  }
  return issues;
}

function emptyBinaryScienceIssues(): BinaryScienceIssues {
  return {
    passbandIssues: [],
    unsupportedPassbandIssues: [],
    stellarInputIssues: [],
    limbDarkeningIssues: [],
  };
}

function collectDetachedBinaryStarIssues(
  star: StarBodyV4,
  ldModel: LimbDarkeningModelConfig,
  issues: BinaryScienceIssues,
): void {
  collectDetachedBinaryStarPhysicalIssues(star, issues);
  collectDetachedBinaryStarPassbandIssues(star, issues);
  collectDetachedBinaryStarLimbDarkeningIssues(star, ldModel, issues);
}

function collectDetachedBinaryStarPhysicalIssues(star: StarBodyV4, issues: BinaryScienceIssues): void {
  if (!isFinitePositive(star.r)) {
    issues.stellarInputIssues.push(
      `star "${star.id}" must define a finite positive radius in detached-binary scientific-browser mode`,
    );
  }
  if (!isFinitePositive(star.teffK)) {
    issues.stellarInputIssues.push(
      `star "${star.id}" must define a finite positive teffK in detached-binary scientific-browser mode`,
    );
  }
}

function collectDetachedBinaryStarPassbandIssues(star: StarBodyV4, issues: BinaryScienceIssues): void {
  if (!hasExplicitPassband(star.passband)) {
    issues.passbandIssues.push(
      `star "${star.id}" must define an explicit passband in detached-binary scientific-browser mode`,
    );
    return;
  }
  if (isSupportedStellarPassband(star.passband)) return;
  issues.unsupportedPassbandIssues.push(
    `star "${star.id}" passband "${String(star.passband)}" is not supported by the bounded scientific photometry path`,
  );
}

function collectDetachedBinaryStarLimbDarkeningIssues(
  star: StarBodyV4,
  ldModel: LimbDarkeningModelConfig,
  issues: BinaryScienceIssues,
): void {
  if (!ldModel) return;
  if (hasExplicitLimbDarkeningBandLaw(ldModel, star.passband)) return;
  if (isFinitePositive(star.loggCgs)) return;
  issues.limbDarkeningIssues.push(
    `star "${star.id}" must define a finite positive loggCgs when photometry.limbDarkeningModel has no explicit law for passband "${String(star.passband)}" in detached-binary scientific-browser mode`,
  );
}

function isFinitePositive(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function assertDetachedBinaryPhysicalBandpass(
  config: SimulationConfigV4,
  primary: StarBodyV4,
  secondary: StarBodyV4,
): void {
  const resolved = resolveDetachedBinaryLuminosities({
    primary,
    secondary,
    fallbackPassband: undefined,
    secondaryFallbackLuminosityScale: 0.3,
  });
  if (resolved.source === "physical-bandpass") return;

  throw createScientificBrowserRuntimeError({
    stage: "config",
    code: "SCB_BINARY_PHOTOMETRY_FALLBACK",
    summary: "detached-binary scientific-browser mode requires physical bandpass weighting",
    details: [
      "detached-binary scientific-browser mode rejects compatibility luminosity scaling",
      "provide explicit per-star physical photometry inputs (radius, teffK, passband)",
    ],
    context: {
      executionMode: config.runtime?.executionMode ?? "interactive",
      runtimeMode: config.runtime?.mode ?? "realtime",
      resolvedSource: resolved.source,
    },
  });
}

function throwConfigIssues(
  details: string[],
  code: ScientificBrowserFailureCode,
  summary: string,
  context: ScientificBrowserFailureContext,
): void {
  if (details.length < 1) return;
  throw createScientificBrowserRuntimeError({
    stage: "config",
    code,
    summary,
    details,
    context,
  });
}

function runtimeContext(config: SimulationConfigV4): ScientificBrowserFailureContext {
  return {
    executionMode: config.runtime?.executionMode ?? "interactive",
    runtimeMode: config.runtime?.mode ?? "realtime",
  };
}

function modeContext(config: SimulationConfigV4): ScientificBrowserFailureContext {
  return {
    ...runtimeContext(config),
    mode: config.mode,
  };
}
