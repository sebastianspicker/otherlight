// src/app/scenario.ts
//
// Scenario loading and defaults.

import { deepClone } from "../core/clone";
import type { SystemParams } from "../core/types";

// IMPORTANT: This file must exist: src/config/scenario.default.json
import scenarioJson from "../config/scenario.default.json";

export type ScenarioFile = {
  defaults: SystemParams;
  ui?: unknown;
  meta?: unknown;
};

type ScenarioUnits = {
  length: string;
  time: string;
  angles: string;
  mass?: string;
};

type ScenarioMeta = {
  units: ScenarioUnits;
};

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function assertScenarioUnitsSI(meta: unknown): void {
  if (!isObject(meta)) {
    throw new Error("scenario.default.json meta must be an object with SI units.");
  }
  const units = (meta as ScenarioMeta).units;
  if (!isObject(units)) {
    throw new Error("scenario.default.json meta.units must be an object with SI units.");
  }
  if (units.length !== "m") throw new Error("scenario.default.json meta.units.length must be 'm'.");
  if (units.time !== "s") throw new Error("scenario.default.json meta.units.time must be 's'.");
  if (units.angles !== "rad") throw new Error("scenario.default.json meta.units.angles must be 'rad'.");
  if (units.mass !== undefined && units.mass !== "kg") {
    throw new Error("scenario.default.json meta.units.mass must be 'kg' when provided.");
  }
}

export function cloneParams(p: SystemParams): SystemParams {
  // Plain-data guarantee: SystemParams is expected to be JSON-serializable in this project.
  return deepClone(p);
}

export function loadScenario(): ScenarioFile {
  const raw: unknown = scenarioJson;

  if (!isObject(raw)) {
    throw new Error("scenario.default.json must be a JSON object");
  }
  const rawObj = raw as Record<string, unknown>;

  const defaults = rawObj.defaults;
  if (!isObject(defaults)) {
    throw new Error("scenario.default.json must contain a 'defaults' object");
  }
  assertScenarioUnitsSI(rawObj.meta);

  // Trust schema for size/speed, but deep-clone to prevent accidental mutation of the import object.
  return { ...rawObj, defaults: cloneParams(defaults as SystemParams) } as ScenarioFile;
}

export const scenario = loadScenario();
export const SCENARIO_DEFAULTS: SystemParams = scenario.defaults;
