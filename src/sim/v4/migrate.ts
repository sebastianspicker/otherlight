/** Normalizes legacy scenarios into the V4 runtime contract. */
import type { SystemParams } from "../../core/types";
import type { SimulationConfigV4 } from "./types";
import { isObject, sanitizeSimulationConfigV4, migrateSystemParamsToV4 } from "./migrateModels";
import { validateSimulationConfigV4 } from "./migrateValidation";

export { collectUnsupportedPhotometryFeaturesV4 } from "./migratePhotometryFeatures";
export { migrateSystemParamsToV4 } from "./migrateModels";

export function isSimulationConfigV4(input: unknown): input is SimulationConfigV4 {
  return validateSimulationConfigV4(input).length === 0;
}

export function normalizeScenarioInputToV4(input: unknown): SimulationConfigV4 {
  if (!isObject(input)) {
    throw new Error("normalizeScenarioInputToV4: input must be an object.");
  }

  if (input.version === "4") {
    const errors = validateSimulationConfigV4(input);
    if (errors.length > 0) {
      throw new Error(`normalizeScenarioInputToV4: invalid V4 config: ${errors.join("; ")}`);
    }
    return sanitizeSimulationConfigV4(input as SimulationConfigV4);
  }

  const rec = input as Record<string, unknown>;
  if (isObject(rec.defaults)) {
    return sanitizeSimulationConfigV4(migrateSystemParamsToV4(rec.defaults as SystemParams));
  }
  return sanitizeSimulationConfigV4(migrateSystemParamsToV4(input as SystemParams));
}
