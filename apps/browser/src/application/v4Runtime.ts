/**
 * Owns v4Runtime support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import { createSimulationV4 } from "../domain/simulation/v4";
import type { SimulationRuntimeDependenciesV4 } from "../domain/simulation/v4";
import {
  createReferenceSimulationV4,
  type SimulationRuntimeV4WithDispose,
} from "../domain/simulation/v4/referenceRuntime";
import {
  toEducationScenarioV4,
  unsupportedEducationScenarioFeatures,
  type BrowserScenarioAuthoringInput,
} from "./browserScenarioAdapter";

export type AppSimulationRuntime = SimulationRuntimeV4WithDispose;

export function createSimulationRuntimeV4FromParams(
  args: BrowserScenarioAuthoringInput & { dependencies?: SimulationRuntimeDependenciesV4 },
): AppSimulationRuntime {
  // All UI paths enter the runtime through this adapter. It is the only runtime
  // ingress that validates BrowserScenarioDraft authoring state into V4.
  const cfg = toEducationScenarioV4(args);
  const unsupportedFeatures = unsupportedEducationScenarioFeatures(cfg);
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
    const runtime = createReferenceSimulationV4(cfg, args.dependencies);
    return {
      ...runtime,
      takeStatusMessage: () => takeStatusMessage(runtime.takeStatusMessage),
    };
  }
  const rt = createSimulationV4(cfg, args.dependencies);
  return {
    ...rt,
    dispose: () => {},
    takeStatusMessage: () => takeStatusMessage(),
  };
}
