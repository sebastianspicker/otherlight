import type { SystemParams } from "../core/types";
import type { RuntimeModeV4 } from "../sim/v4";
import type { BinaryLabConfigV4 } from "../sim/v4/types";
import { createSimulationRuntimeV4FromParams, type AppSimulationRuntime } from "./v4Runtime";

export type RuntimeBuildArgs = {
  system: SystemParams;
  binaryMode: boolean;
  runtimeMode: RuntimeModeV4;
  binaryLabDefaults?: BinaryLabConfigV4;
};

export async function buildRuntime(args: RuntimeBuildArgs): Promise<AppSimulationRuntime> {
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
