/**
 * Owns bootstrap Runtime support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { BrowserScenarioDraft } from "../domain/model/types";
import type { BinaryLabConfigV4 } from "../domain/simulation/v4/types";
import type { RuntimeModeV4, SimulationRuntimeDependenciesV4 } from "../domain/simulation/v4";
import { binaryFluxDisplayBaseline, fluxDisplayTitle } from "./displayFlux";
import type { AppSimulationRuntime } from "./v4Runtime";

export const readBootstrapRuntimeMode = (value: string | undefined): RuntimeModeV4 =>
  value === "reference" ? "reference" : "realtime";

export const runtimeArgsFromBootstrapState = (
  system: BrowserScenarioDraft,
  binaryMode: boolean,
  runtimeMode: RuntimeModeV4,
  binaryLabDefaults: BinaryLabConfigV4 | undefined,
  dependencies?: SimulationRuntimeDependenciesV4,
) => ({ system, binaryMode, runtimeMode, binaryLabDefaults, dependencies });

export const syncBootstrapDisplayFlux = (
  state: { displayFluxScale: number; displayFluxTitle: string },
  simulation: AppSimulationRuntime,
): void => {
  const config = simulation.getConfig();
  state.displayFluxScale = binaryFluxDisplayBaseline(config) ?? 1;
  state.displayFluxTitle = fluxDisplayTitle(config);
};
