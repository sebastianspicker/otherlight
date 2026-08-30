/**
 * Owns reference runtime support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import {
  createSimulationV4,
  type SimulationRuntimeDependenciesV4,
  type SimulationRuntimeV4,
} from "./runtime";
import type { EducationScenarioV4 } from "./types";

export type ReferenceRuntimeOptions = SimulationRuntimeDependenciesV4;

export type SimulationRuntimeV4WithDispose = SimulationRuntimeV4 & {
  dispose: () => void;
  takeStatusMessage: () => string | undefined;
};

export function createReferenceSimulationV4(
  config: EducationScenarioV4,
  options: ReferenceRuntimeOptions = {},
): SimulationRuntimeV4WithDispose {
  const runtime = createSimulationV4(config, {
    computeDidacticSignals: options.computeDidacticSignals,
  });
  let disposed = false;
  let statusMessage: string | undefined =
    "Reference mode runs on the in-thread deterministic runtime; the worker handoff has been retired.";

  return {
    prepare: async () => {
      await runtime.prepare();
    },
    step: (tObsSec) => {
      if (disposed) throw new Error("Reference runtime disposed.");
      return runtime.step(tObsSec);
    },
    setMode: (mode) => {
      runtime.setMode(mode);
    },
    getMode: () => runtime.getMode(),
    getConfig: () => runtime.getConfig(),
    dispose: () => {
      disposed = true;
    },
    takeStatusMessage: () => {
      const out = statusMessage;
      statusMessage = undefined;
      return out;
    },
  };
}
