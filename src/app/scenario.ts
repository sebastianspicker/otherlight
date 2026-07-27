/** Coordinates scenario selection and parameter application for the app shell. */
//
// Scenario loading and defaults re-exported from canonical locations.
//
// The actual implementations live in core/clone.ts (cloneParams) and
// config/defaults.ts (SCENARIO_DEFAULTS) so that sim/ and ui/ layers
// can import them without violating architectural boundaries.

import type { SystemParams } from "../core/types";
import { cloneParams as _cloneParams } from "../core/clone";
import { SCENARIO_DEFAULTS as _DEFAULTS } from "../config/defaults";
import scenarioJson from "../config/scenario.default.json";

export const cloneParams = _cloneParams;
export const SCENARIO_DEFAULTS = _DEFAULTS;

export type ScenarioFile = {
  defaults: SystemParams;
  ui?: unknown;
  meta?: unknown;
};

/** Full parsed scenario file (defaults + meta). Used by tests. */
export const scenario: ScenarioFile = {
  defaults: _DEFAULTS,
  ...(typeof scenarioJson === "object" && scenarioJson !== null ? scenarioJson : {}),
} as ScenarioFile;
