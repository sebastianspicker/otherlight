/** Normalizes legacy scenarios into the V4 runtime contract. */
import type { SystemParamsV2 } from "../../model/types";
import type { EducationScenarioV4 } from "./types";
import {
  isObject,
  sanitizeEducationScenarioV4,
  mapBrowserScenarioDraftToEducationScenarioV4,
} from "./migrateModels";
import { validateEducationScenarioV4 } from "./migrateValidation";

export { collectUnsupportedPhotometryFeaturesV4 } from "./migratePhotometryFeatures";
export { mapBrowserScenarioDraftToEducationScenarioV4 } from "./migrateModels";

export function isEducationScenarioV4(input: unknown): input is EducationScenarioV4 {
  return validateEducationScenarioV4(input).length === 0;
}

export function normalizeEducationScenarioV4Input(input: unknown): EducationScenarioV4 {
  if (!isObject(input)) {
    throw new Error("normalizeEducationScenarioV4Input: input must be an object.");
  }

  if (input.version === "4") {
    const errors = validateEducationScenarioV4(input);
    if (errors.length > 0) {
      throw new Error(`normalizeEducationScenarioV4Input: invalid V4 config: ${errors.join("; ")}`);
    }
    return sanitizeEducationScenarioV4(input as EducationScenarioV4);
  }

  const rec = input as Record<string, unknown>;
  // V2 is accepted only while ingesting a legacy payload, then immediately
  // mapped into the canonical V4 scenario. It never becomes live draft state.
  if (isObject(rec.defaults)) {
    return sanitizeEducationScenarioV4(
      mapBrowserScenarioDraftToEducationScenarioV4(rec.defaults as SystemParamsV2),
    );
  }
  return sanitizeEducationScenarioV4(mapBrowserScenarioDraftToEducationScenarioV4(input as SystemParamsV2));
}
