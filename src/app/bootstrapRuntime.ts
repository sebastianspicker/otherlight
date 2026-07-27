/**
 * Owns bootstrap Runtime support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { SystemParams } from "../core/types";
import type { BinaryLabConfigV4 } from "../sim/v4/types";
import type { RuntimeModeV4 } from "../sim/v4";
import { binaryFluxDisplayBaseline, fluxDisplayTitle } from "./displayFlux";
import type { AppSimulationRuntime } from "./v4Runtime";

export const readBootstrapRuntimeMode = (value: string | undefined): RuntimeModeV4 =>
  value === "reference" ? "reference" : "realtime";

export const runtimeArgsFromBootstrapState = (
  system: SystemParams,
  binaryMode: boolean,
  runtimeMode: RuntimeModeV4,
  binaryLabDefaults: BinaryLabConfigV4 | undefined,
) => ({ system, binaryMode, runtimeMode, binaryLabDefaults });

export const syncBootstrapDisplayFlux = (
  state: { displayFluxScale: number; displayFluxTitle: string },
  simulation: AppSimulationRuntime,
): void => {
  const config = simulation.getConfig();
  state.displayFluxScale = binaryFluxDisplayBaseline(config) ?? 1;
  state.displayFluxTitle = fluxDisplayTitle(config);
};
