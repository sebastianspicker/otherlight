// src/app/scenario.ts
//
// Scenario loading and defaults.

import type { SystemParams } from "../core/types";

// IMPORTANT: This file must exist: src/config/scenario.default.json
import scenarioJson from "../config/scenario.default.json";

export type ScenarioFile = {
  defaults: SystemParams;
  ui?: unknown;
  meta?: unknown;
};

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export function cloneParams(p: SystemParams): SystemParams {
  // Plain-data guarantee: SystemParams is expected to be JSON-serializable in this project.
  return JSON.parse(JSON.stringify(p)) as SystemParams;
}

export function loadScenario(): ScenarioFile {
  const raw: unknown = scenarioJson as unknown;

  if (!isObject(raw)) {
    throw new Error("scenario.default.json must be a JSON object");
  }

  const defaults = (raw as any).defaults as unknown;
  if (!isObject(defaults)) {
    throw new Error("scenario.default.json must contain a 'defaults' object");
  }

  // Trust schema for size/speed, but deep-clone to prevent accidental mutation of the import object.
  const typedDefaults = defaults as SystemParams;
  return { ...(raw as any), defaults: cloneParams(typedDefaults) } as ScenarioFile;
}

export const scenario = loadScenario();
export const SCENARIO_DEFAULTS: SystemParams = scenario.defaults;
