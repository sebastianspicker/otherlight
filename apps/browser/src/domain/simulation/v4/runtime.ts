/**
 * Owns the stateful V4 execution lifecycle, mode switching, and reference
 * aggregation while keeping numerical state independent of browser controls.
 */
import { deepClone } from "../../model/clone";
import type { SimulationFrame } from "../frames";
import { stepNativeSimulationV4 } from "./nativeEngine";
import type {
  ComputeDidacticSignalsFn,
  EducationScenarioV4,
  RuntimeExecutionModeV4,
  RuntimeModeV4,
} from "./types";
import { createScientificBrowserRuntimeError, isScientificBrowserRuntimeError } from "./scientificErrors";
import { assertScientificBrowserConfig } from "./scientificBrowserConfig";
import { detachedBinaryBaselineFlux, displayFluxValueForConfig } from "./binaryBaseline";
import { averageNumericFields } from "./runtimeAggregation";

/** Per-runtime optional integrations; no simulation-wide mutable hook is read. */
export type SimulationRuntimeDependenciesV4 = {
  computeDidacticSignals?: ComputeDidacticSignalsFn;
};

export type SimulationRuntimeV4 = {
  prepare: () => Promise<void>;
  step: (tObsSec: number) => SimulationFrame;
  setMode: (mode: RuntimeModeV4) => void;
  getMode: () => RuntimeModeV4;
  getConfig: () => EducationScenarioV4;
};

function finiteSubsteps(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 5;
  return Math.max(1, Math.min(25, Math.floor(v)));
}

function rethrowScientificBrowserStepFailure(args: {
  error: unknown;
  requestedTimeSec: number;
  attemptedTimeSec: number;
  runtimeMode: RuntimeModeV4;
  executionMode: RuntimeExecutionModeV4;
}): never {
  if (isScientificBrowserRuntimeError(args.error)) {
    throw args.error;
  }
  const message = args.error instanceof Error ? args.error.message : String(args.error);
  throw createScientificBrowserRuntimeError({
    stage: "step",
    code: "SCB_STEP_FAILED",
    summary: "runtime step failed on the scientific-browser path",
    details: [message],
    context: {
      runtimeMode: args.runtimeMode,
      executionMode: args.executionMode,
      requestedTimeSec: args.requestedTimeSec,
      attemptedTimeSec: args.attemptedTimeSec,
    },
    cause: args.error,
  });
}

function stepAtTime(args: {
  config: EducationScenarioV4;
  requestedTimeSec: number;
  attemptedTimeSec: number;
  runtimeMode: RuntimeModeV4;
  executionMode: RuntimeExecutionModeV4;
  conservationBaseline?: { energy?: number; angularMomentum?: number };
  dependencies: SimulationRuntimeDependenciesV4;
}): ReturnType<typeof stepNativeSimulationV4> {
  try {
    return stepNativeSimulationV4({
      config: args.config,
      tObsSec: args.attemptedTimeSec,
      mode: args.runtimeMode,
      executionMode: args.executionMode,
      conservationBaseline: args.conservationBaseline,
      computeDidacticSignals: args.dependencies.computeDidacticSignals,
    });
  } catch (error) {
    if (args.executionMode !== "scientific-browser") throw error;
    rethrowScientificBrowserStepFailure({
      error,
      requestedTimeSec: args.requestedTimeSec,
      attemptedTimeSec: args.attemptedTimeSec,
      runtimeMode: args.runtimeMode,
      executionMode: args.executionMode,
    });
  }
}

function aggregateReferenceStep(config: EducationScenarioV4, samples: SimulationFrame[]): SimulationFrame {
  const center = samples[Math.floor(samples.length / 2)]!;
  const flux = {
    total: samples.reduce((sum, step) => sum + step.flux.total, 0) / samples.length,
    transitFactor: samples.reduce((sum, step) => sum + step.flux.transitFactor, 0) / samples.length,
    stellarPreTransit: samples.reduce((sum, step) => sum + step.flux.stellarPreTransit, 0) / samples.length,
    stellarVariability: samples.reduce((sum, step) => sum + step.flux.stellarVariability, 0) / samples.length,
    planetPhase: samples.reduce((sum, step) => sum + step.flux.planetPhase, 0) / samples.length,
    moonPhase: samples.reduce((sum, step) => sum + step.flux.moonPhase, 0) / samples.length,
    forwardScattering: samples.reduce((sum, step) => sum + step.flux.forwardScattering, 0) / samples.length,
    ringScattering: samples.reduce((sum, step) => sum + step.flux.ringScattering, 0) / samples.length,
    refraction: samples.reduce((sum, step) => sum + (step.flux.refraction ?? 0), 0) / samples.length,
  };
  const decomposition = averageNumericFields(samples.map((step) => step.flux.decomposition));
  const fluxComponents = averageNumericFields(samples.map((step) => step.renderSignals.fluxComponents));
  const baselineFluxUsed = detachedBinaryBaselineFlux(config) ?? center.debug?.baselineFluxUsed;
  const displayFluxValue = displayFluxValueForConfig(config, flux.total);

  return {
    ...center,
    flux: {
      ...center.flux,
      ...flux,
      decomposition: {
        ...(center.flux.decomposition ?? {}),
        ...(decomposition ?? {}),
        total: flux.total,
        transitFactor: flux.transitFactor,
        stellarPreTransit: flux.stellarPreTransit,
        stellarVariability: flux.stellarVariability,
        planetPhase: flux.planetPhase,
        moonPhase: flux.moonPhase,
        forwardScattering: flux.forwardScattering,
        ringScattering: flux.ringScattering,
        refraction: flux.refraction,
      },
    },
    renderSignals: {
      ...center.renderSignals,
      fluxComponents: {
        ...center.renderSignals.fluxComponents,
        ...(fluxComponents ?? {}),
        total: flux.total,
        transitFactor: flux.transitFactor,
        stellarPreTransit: flux.stellarPreTransit,
        stellarVariability: flux.stellarVariability,
        planetPhase: flux.planetPhase,
        moonPhase: flux.moonPhase,
        forwardScattering: flux.forwardScattering,
        ringScattering: flux.ringScattering,
        refraction: flux.refraction,
      },
    },
    debug: center.debug
      ? {
          ...center.debug,
          baselineFluxUsed,
          displayFluxValue,
        }
      : {
          baselineFluxUsed,
          displayFluxValue,
        },
  };
}

/**
 * Creates the validated V4 runtime; time is observed seconds and invalid scientific-browser input fails closed.
 * The runtime retains its conservation baseline across steps, so callers must create a fresh instance for a new lifecycle.
 */
export function createSimulationV4(
  input: EducationScenarioV4,
  dependencies: SimulationRuntimeDependenciesV4 = {},
): SimulationRuntimeV4 {
  const config = deepClone(input);
  assertScientificBrowserConfig(config);

  let mode: RuntimeModeV4 = config.runtime?.mode ?? "realtime";
  const executionMode: RuntimeExecutionModeV4 = config.runtime?.executionMode ?? "interactive";
  const substeps = finiteSubsteps(config.runtime?.referenceSubsteps);
  let conservationBaseline: { energy?: number; angularMomentum?: number } | undefined;

  return {
    prepare: async () => {},
    step: (tObsSec: number): SimulationFrame => {
      if (mode === "realtime") {
        const out = stepAtTime({
          config,
          requestedTimeSec: tObsSec,
          attemptedTimeSec: tObsSec,
          runtimeMode: mode,
          executionMode,
          conservationBaseline,
          dependencies,
        });
        conservationBaseline = out.conservationBaseline;
        return out.step;
      }

      // Reference path: deterministic temporal supersampling around observation time.
      // This is intentionally conservative and stable for benchmark mode.
      // dt is in seconds; 0.2 s is fine-grained relative to typical orbital periods (hours–days).
      const dt = 0.2;
      const samples: SimulationFrame[] = [];
      const publicStepBaseline = conservationBaseline;
      const centerIndex = Math.floor(substeps / 2);
      let nextConservationBaseline = conservationBaseline;
      for (let i = 0; i < substeps; i++) {
        const alpha = substeps <= 1 ? 0 : i / (substeps - 1);
        const t = tObsSec + (alpha - 0.5) * dt;
        const out = stepAtTime({
          config,
          requestedTimeSec: tObsSec,
          attemptedTimeSec: t,
          runtimeMode: mode,
          executionMode,
          conservationBaseline: publicStepBaseline,
          dependencies,
        });
        if (i === centerIndex) nextConservationBaseline = out.conservationBaseline;
        samples.push(out.step);
      }
      conservationBaseline = nextConservationBaseline;
      return aggregateReferenceStep(config, samples);
    },
    setMode: (next: RuntimeModeV4): void => {
      mode = next;
    },
    getMode: (): RuntimeModeV4 => mode,
    getConfig: (): EducationScenarioV4 => deepClone(config),
  };
}
