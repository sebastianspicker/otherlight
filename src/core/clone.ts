// src/core/clone.ts
//
// Plain-data deep clone for JSON-serializable values only.

import type { SystemParams } from "./types";

/**
 * Deep clone a value via JSON round-trip.
 * Use only for plain-data (no functions, symbols, or non-JSON types).
 */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Clone SystemParams (plain-data guarantee: JSON-serializable). */
export function cloneParams(p: SystemParams): SystemParams {
  return deepClone(p);
}
