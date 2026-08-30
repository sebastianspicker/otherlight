/**
 * Owns runtime Lifecycle support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { BrowserScenarioDraft } from "../domain/model/types";
import type { RuntimeModeV4 } from "../domain/simulation/v4";
import type { BinaryLabConfigV4 } from "../domain/simulation/v4/types";
import { createSimulationRuntimeV4FromParams, type AppSimulationRuntime } from "./v4Runtime";

type RuntimeBuildArgs = {
  system: BrowserScenarioDraft;
  binaryMode: boolean;
  runtimeMode: RuntimeModeV4;
  binaryLabDefaults?: BinaryLabConfigV4;
};

async function buildRuntime(args: RuntimeBuildArgs): Promise<AppSimulationRuntime> {
  const runtime = createSimulationRuntimeV4FromParams(args);
  try {
    await runtime.prepare();
  } catch (err) {
    runtime.dispose();
    throw err;
  }
  return runtime;
}

export async function replaceRuntime(
  current: AppSimulationRuntime,
  args: RuntimeBuildArgs,
): Promise<AppSimulationRuntime> {
  const next = await buildRuntime(args);
  current.dispose();
  return next;
}

export function takeRuntimeStatus(runtime: AppSimulationRuntime): string | undefined {
  return runtime.takeStatusMessage();
}
