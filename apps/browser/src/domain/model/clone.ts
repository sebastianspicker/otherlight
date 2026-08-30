/** Clones simulation-facing values without sharing mutable nested state. */
//
// Plain-data deep clone for JSON-serializable values only.

import type { BrowserScenarioDraft } from "./types";

/**
 * Deep clone a value via JSON round-trip.
 * Use only for plain-data (no functions, symbols, or non-JSON types).
 * Throws if the value contains function-valued orbit providers (which would
 * be silently dropped by JSON serialization).
 */
export function deepClone<T>(value: T): T {
  const rec = value as Record<string, Record<string, unknown> | undefined>;
  if (typeof rec?.planet?.orbit === "function" || typeof rec?.moon?.orbitAroundPlanet === "function") {
    throw new Error("deepClone: cannot clone function-valued orbit providers; resolve them first");
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Clone BrowserScenarioDraft (plain-data guarantee: JSON-serializable). */
export function cloneParams(p: BrowserScenarioDraft): BrowserScenarioDraft {
  return deepClone(p);
}
