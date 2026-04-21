import { hasExplicitLimbDarkeningBandLaw } from "../../photometry/limbDarkening";
import {
  isSupportedStellarPassband,
  resolveDetachedBinaryLuminosities,
} from "../../photometry/stellarBandFlux";
import { createScientificBrowserRuntimeError } from "./scientificErrors";
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
import type { SimulationConfigV4 } from "./types";

function isFiniteIntegerInRange(x: unknown, min: number, max: number): boolean {
  return typeof x === "number" && Number.isFinite(x) && Number.isInteger(x) && x >= min && x <= max;
}

function hasExplicitPassband(passband: unknown): boolean {
  return typeof passband === "string" && passband.trim().length > 0;
}

export function assertScientificBrowserConfig(config: SimulationConfigV4): void {
  if (config.runtime?.executionMode !== "scientific-browser") return;

  const additiveChannelIssues = collectScientificBrowserActiveAdditiveChannelIssues(config.photometry);
  const additiveDeclarationIssues = collectScientificBrowserAdditiveDeclarationIssues(
    config.photometry,
    additiveChannelIssues,
  );
  if (additiveDeclarationIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_ADDITIVE_FLUX_INVALID_CONFIG",
      summary:
        "scientific-browser additive photometry requires an explicit higher-fidelity composition declaration",
      details: additiveDeclarationIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
      },
    });
  }
  const additiveExecutionIssues = collectScientificBrowserAdditiveExecutionIssues(config);
  if (additiveExecutionIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_ADDITIVE_FLUX_INVALID_CONFIG",
      summary:
        "scientific-browser additive photometry requires executable native geometry for the declared higher-fidelity branch",
      details: additiveExecutionIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
      },
    });
  }

  const unsupportedTransmissionModelIssues =
    collectScientificBrowserUnsupportedTransmissionModelIssues(config);
  if (unsupportedTransmissionModelIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_TRANSMISSION_MODEL_UNSUPPORTED",
      summary:
        "scientific-browser native transmission currently supports atmosphereRT only; atmosphereTransmission is still unsupported",
      details: unsupportedTransmissionModelIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
      },
    });
  }

  const unsupportedRtFeatureIssues = collectScientificBrowserUnsupportedRtFeatureIssues(config);
  if (unsupportedRtFeatureIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_TRANSMISSION_RT_FEATURE_UNSUPPORTED",
      summary:
        "scientific-browser native atmosphereRT currently supports only attenuation layers, not emission, scattering, or temperature-profile RT controls",
      details: unsupportedRtFeatureIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
      },
    });
  }

  const rtInputIssues = collectScientificBrowserRtInputIssues(config);
  if (rtInputIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_TRANSMISSION_RT_INVALID_INPUTS",
      summary: "scientific-browser native atmosphereRT requires explicit finite gray attenuation inputs",
      details: rtInputIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
      },
    });
  }

  const rtLayerIssues = collectScientificBrowserRtLayerIssues(config);
  if (rtLayerIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_TRANSMISSION_RT_NO_VALID_LAYERS",
      summary: "scientific-browser native atmosphereRT requires at least one valid attenuation layer",
      details: rtLayerIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
      },
    });
  }

  const transmissionIssues = collectScientificBrowserTransmissionIssues(config);
  if (transmissionIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_TRANSMISSION_MIXED_SHAPE",
      summary:
        "scientific-browser atmospheric transmission currently supports only circle-only transmission geometries",
      details: transmissionIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
      },
    });
  }

  if (
    config.runtime?.mode === "reference" &&
    !isFiniteIntegerInRange(config.runtime?.referenceSubsteps, 1, 25)
  ) {
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

  const stellarSurfaceIssues = collectScientificBrowserStellarSurfaceIssues(config.photometry);
  if (stellarSurfaceIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_INVALID_STELLAR_SURFACE",
      summary: "scientific-browser mode requires explicit finite stellar-surface variability controls",
      details: stellarSurfaceIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
        mode: config.mode,
      },
    });
  }

  const relativityIssues = collectScientificBrowserRelativityIssues(config);
  if (relativityIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_INVALID_RELATIVITY_CONFIG",
      summary: "scientific-browser relativity requires explicit model and solver controls",
      details: relativityIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
        mode: config.mode,
      },
    });
  }

  const nbodyIssues = collectScientificBrowserNBodyIssues(config);
  if (nbodyIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_INVALID_NBODY_CONFIG",
      summary: "scientific-browser nbodyPlanetMoon requires explicit physical mass inputs",
      details: nbodyIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
        mode: config.mode,
      },
    });
  }

  const orbitIssues = collectScientificBrowserOrbitIssues(config);
  if (orbitIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_INVALID_ORBIT",
      summary: "scientific-browser mode requires semantically valid static orbit elements",
      details: orbitIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
        mode: config.mode,
      },
    });
  }

  if (config.mode !== "detached-binary-lab") return;

  const [primary, secondary] = config.bodies.stars;
  const passbandIssues: string[] = [];
  const unsupportedPassbandIssues: string[] = [];
  const stellarInputIssues: string[] = [];
  const limbDarkeningIssues: string[] = [];
  const ldModel = config.photometry?.limbDarkeningModel;
  if (!ldModel) {
    limbDarkeningIssues.push(
      "photometry.limbDarkeningModel must be defined in detached-binary scientific-browser mode",
    );
  }
  if (!(Number.isFinite(primary.r) && (primary.r as number) > 0)) {
    stellarInputIssues.push(
      `star "${primary.id}" must define a finite positive radius in detached-binary scientific-browser mode`,
    );
  }
  if (!(Number.isFinite(primary.teffK) && (primary.teffK as number) > 0)) {
    stellarInputIssues.push(
      `star "${primary.id}" must define a finite positive teffK in detached-binary scientific-browser mode`,
    );
  }
  if (!hasExplicitPassband(primary.passband)) {
    passbandIssues.push(
      `star "${primary.id}" must define an explicit passband in detached-binary scientific-browser mode`,
    );
  } else if (!isSupportedStellarPassband(primary.passband)) {
    unsupportedPassbandIssues.push(
      `star "${primary.id}" passband "${String(primary.passband)}" is not supported by the bounded scientific photometry path`,
    );
  }
  if (
    ldModel &&
    !hasExplicitLimbDarkeningBandLaw(ldModel, primary.passband) &&
    !(Number.isFinite(primary.loggCgs) && (primary.loggCgs as number) > 0)
  ) {
    limbDarkeningIssues.push(
      `star "${primary.id}" must define a finite positive loggCgs when photometry.limbDarkeningModel has no explicit law for passband "${String(primary.passband)}" in detached-binary scientific-browser mode`,
    );
  }
  if (!(Number.isFinite(secondary.r) && (secondary.r as number) > 0)) {
    stellarInputIssues.push(
      `star "${secondary.id}" must define a finite positive radius in detached-binary scientific-browser mode`,
    );
  }
  if (!(Number.isFinite(secondary.teffK) && (secondary.teffK as number) > 0)) {
    stellarInputIssues.push(
      `star "${secondary.id}" must define a finite positive teffK in detached-binary scientific-browser mode`,
    );
  }
  if (!hasExplicitPassband(secondary.passband)) {
    passbandIssues.push(
      `star "${secondary.id}" must define an explicit passband in detached-binary scientific-browser mode`,
    );
  } else if (!isSupportedStellarPassband(secondary.passband)) {
    unsupportedPassbandIssues.push(
      `star "${secondary.id}" passband "${String(secondary.passband)}" is not supported by the bounded scientific photometry path`,
    );
  }
  if (
    ldModel &&
    !hasExplicitLimbDarkeningBandLaw(ldModel, secondary.passband) &&
    !(Number.isFinite(secondary.loggCgs) && (secondary.loggCgs as number) > 0)
  ) {
    limbDarkeningIssues.push(
      `star "${secondary.id}" must define a finite positive loggCgs when photometry.limbDarkeningModel has no explicit law for passband "${String(secondary.passband)}" in detached-binary scientific-browser mode`,
    );
  }
  if (stellarInputIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_BINARY_INVALID_STELLAR_INPUTS",
      summary: "detached-binary scientific-browser mode requires explicit stellar photometry inputs",
      details: stellarInputIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
      },
    });
  }
  if (passbandIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_BINARY_IMPLICIT_PASSBAND",
      summary: "detached-binary scientific-browser mode rejects implicit passband fallback",
      details: passbandIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
      },
    });
  }
  if (unsupportedPassbandIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_BINARY_UNSUPPORTED_PASSBAND",
      summary: "detached-binary scientific-browser mode requires supported explicit passbands",
      details: unsupportedPassbandIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
      },
    });
  }
  if (limbDarkeningIssues.length > 0) {
    throw createScientificBrowserRuntimeError({
      stage: "config",
      code: "SCB_BINARY_LIMB_DARKENING_FALLBACK",
      summary:
        "detached-binary scientific-browser mode requires star-specific eclipse surface-brightness inputs",
      details: limbDarkeningIssues,
      context: {
        executionMode: config.runtime?.executionMode ?? "interactive",
        runtimeMode: config.runtime?.mode ?? "realtime",
      },
    });
  }

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
