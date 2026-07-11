// src/config/defaults.ts
//
// Scenario defaults loaded from the bundled JSON snapshot.
// Lives in config/ so that both sim/ and ui/ can import without violating layer boundaries.

import type { SystemParams } from "../core/types";
import { cloneParams } from "../core/clone";

// IMPORTANT: This file must exist: src/config/scenario.default.json
import scenarioJson from "./scenario.default.json";

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

function scenarioRoot(raw: unknown): Record<string, unknown> {
  if (!isObject(raw)) {
    throw new Error("scenario.default.json must be a JSON object");
  }
  return raw;
}

function scenarioDefaults(rawObj: Record<string, unknown>): Record<string, unknown> {
  const defaults = rawObj.defaults;
  if (!isObject(defaults)) {
    throw new Error("scenario.default.json must contain a 'defaults' object");
  }
  return defaults;
}

function assertDefaultStar(defaults: Record<string, unknown>): void {
  const star = defaults.star as Record<string, unknown> | undefined;
  if (!star || typeof star.r !== "number" || !(star.r > 0)) {
    throw new Error("scenario.default.json defaults.star.r must be a positive number.");
  }
}

function assertDefaultPlanet(defaults: Record<string, unknown>): void {
  const planet = defaults.planet as Record<string, unknown> | undefined;
  const planetOrbit = planet?.orbit as Record<string, unknown> | undefined;
  if (!planet || !planetOrbit || typeof planetOrbit.period !== "number" || !(planetOrbit.period > 0)) {
    throw new Error("scenario.default.json defaults.planet.orbit.period must be a positive number.");
  }
}

function assertCriticalDefaults(defaults: Record<string, unknown>): void {
  assertDefaultStar(defaults);
  assertDefaultPlanet(defaults);
}

function loadDefaults(): SystemParams {
  const rawObj = scenarioRoot(scenarioJson);
  const defaults = scenarioDefaults(rawObj);
  assertScenarioUnitsSI(rawObj.meta);

  // Basic structural validation of critical numeric fields before the cast.
  assertCriticalDefaults(defaults);

  // Deep-clone to prevent accidental mutation of the import object.
  return cloneParams(defaults as SystemParams);
}

/** Default scenario parameters (SI units, deep-cloned from bundled JSON). */
export const SCENARIO_DEFAULTS: SystemParams = loadDefaults();
