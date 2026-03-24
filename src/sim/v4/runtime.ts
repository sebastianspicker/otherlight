import { deepClone } from "../../core/clone";
import type { SimulationStepV3 } from "../v3";
import { normalizeScenarioInputToV4 } from "./migrate";
import { stepNativeSimulationV4 } from "./nativeEngine";
import type { RuntimeModeV4, SimulationConfigV4 } from "./types";

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

export function createSimulationV4(input: SimulationConfigV4 | unknown): SimulationRuntimeV4 {
  const config = normalizeScenarioInputToV4(input);

  let mode: RuntimeModeV4 = config.runtime?.mode ?? "realtime";
  const substeps = finiteSubsteps(config.runtime?.referenceSubsteps);
  let conservationBaseline: { energy?: number; angularMomentum?: number } | undefined;

  return {
    prepare: async () => {},
    step: (tObsSec: number): SimulationStepV3 => {
      if (mode === "realtime") {
        const out = stepNativeSimulationV4({
          config,
          tObsSec,
          mode,
          conservationBaseline,
        });
        conservationBaseline = out.conservationBaseline;
        return out.step;
      }

      // Reference path: deterministic temporal supersampling around observation time.
      // This is intentionally conservative and stable for benchmark mode.
      // dt is in seconds; 0.2 s is fine-grained relative to typical orbital periods (hours–days).
      const dt = 0.2;
      let acc = 0;
      let last!: SimulationStepV3;
      for (let i = 0; i < substeps; i++) {
        const alpha = substeps <= 1 ? 0 : i / (substeps - 1);
        const t = tObsSec + (alpha - 0.5) * dt;
        const out = stepNativeSimulationV4({
          config,
          tObsSec: t,
          mode,
          conservationBaseline,
        });
        conservationBaseline = out.conservationBaseline;
        acc += out.step.flux.total;
        last = out.step;
      }
      return {
        ...last,
        flux: {
          ...last.flux,
          total: acc / substeps,
        },
      };
    },
    setMode: (next: RuntimeModeV4): void => {
      mode = next;
    },
    getMode: (): RuntimeModeV4 => mode,
    getConfig: (): SimulationConfigV4 => deepClone(config),
  };
}
