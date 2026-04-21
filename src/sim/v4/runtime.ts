import { deepClone } from "../../core/clone";
import type { SimulationStepV3 } from "../v3";
import { normalizeScenarioInputToV4 } from "./migrate";
import { stepNativeSimulationV4 } from "./nativeEngine";
import type { RuntimeExecutionModeV4, RuntimeModeV4, SimulationConfigV4 } from "./types";
import { createScientificBrowserRuntimeError, isScientificBrowserRuntimeError } from "./scientificErrors";
import { assertScientificBrowserConfig } from "./scientificBrowserConfig";
import { detachedBinaryBaselineFlux, displayFluxValueForConfig } from "./binaryBaseline";

export type SimulationRuntimeV4 = {
  prepare: () => Promise<void>;
  step: (tObsSec: number) => SimulationStepV3;
  setMode: (mode: RuntimeModeV4) => void;
  getMode: () => RuntimeModeV4;
  getConfig: () => SimulationConfigV4;
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
  config: SimulationConfigV4;
  requestedTimeSec: number;
  attemptedTimeSec: number;
  runtimeMode: RuntimeModeV4;
  executionMode: RuntimeExecutionModeV4;
  conservationBaseline?: { energy?: number; angularMomentum?: number };
}): ReturnType<typeof stepNativeSimulationV4> {
  try {
    return stepNativeSimulationV4({
      config: args.config,
      tObsSec: args.attemptedTimeSec,
      mode: args.runtimeMode,
      executionMode: args.executionMode,
      conservationBaseline: args.conservationBaseline,
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

function averageNumericFields<T extends Record<string, unknown>>(
  items: Array<T | undefined>,
): Partial<T> | undefined {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item) continue;
    for (const [key, value] of Object.entries(item)) {
      if (!(typeof value === "number" && Number.isFinite(value))) continue;
      sums.set(key, (sums.get(key) ?? 0) + value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  if (sums.size === 0) return undefined;

  const averaged: Record<string, number> = {};
  for (const [key, sum] of sums) {
    averaged[key] = sum / (counts.get(key) ?? 1);
  }
  return averaged as Partial<T>;
}

function aggregateReferenceStep(config: SimulationConfigV4, samples: SimulationStepV3[]): SimulationStepV3 {
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

export function createSimulationV4(input: SimulationConfigV4 | unknown): SimulationRuntimeV4 {
  const config = normalizeScenarioInputToV4(input);
  assertScientificBrowserConfig(config);

  let mode: RuntimeModeV4 = config.runtime?.mode ?? "realtime";
  const executionMode: RuntimeExecutionModeV4 = config.runtime?.executionMode ?? "interactive";
  const substeps = finiteSubsteps(config.runtime?.referenceSubsteps);
  let conservationBaseline: { energy?: number; angularMomentum?: number } | undefined;

  return {
    prepare: async () => {},
    step: (tObsSec: number): SimulationStepV3 => {
      if (mode === "realtime") {
        const out = stepAtTime({
          config,
          requestedTimeSec: tObsSec,
          attemptedTimeSec: tObsSec,
          runtimeMode: mode,
          executionMode,
          conservationBaseline,
        });
        conservationBaseline = out.conservationBaseline;
        return out.step;
      }

      // Reference path: deterministic temporal supersampling around observation time.
      // This is intentionally conservative and stable for benchmark mode.
      // dt is in seconds; 0.2 s is fine-grained relative to typical orbital periods (hours–days).
      const dt = 0.2;
      const samples: SimulationStepV3[] = [];
      for (let i = 0; i < substeps; i++) {
        const alpha = substeps <= 1 ? 0 : i / (substeps - 1);
        const t = tObsSec + (alpha - 0.5) * dt;
        const out = stepAtTime({
          config,
          requestedTimeSec: tObsSec,
          attemptedTimeSec: t,
          runtimeMode: mode,
          executionMode,
          conservationBaseline,
        });
        conservationBaseline = out.conservationBaseline;
        samples.push(out.step);
      }
      return aggregateReferenceStep(config, samples);
    },
    setMode: (next: RuntimeModeV4): void => {
      mode = next;
    },
    getMode: (): RuntimeModeV4 => mode,
    getConfig: (): SimulationConfigV4 => deepClone(config),
  };
}
