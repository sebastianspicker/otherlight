// src/core/clone.ts
//
// Plain-data deep clone for JSON-serializable values only.

/**
 * Deep clone a value via JSON round-trip.
 * Use only for plain-data (no functions, symbols, or non-JSON types).
 */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
