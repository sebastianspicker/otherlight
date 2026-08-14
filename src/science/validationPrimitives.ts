/** Supplies shared strict-validation primitives and the public validation error type. */
import type { Vector3 } from "./types";

export class ScienceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScienceValidationError";
  }
}

export type UnknownRecord = Record<string, unknown>;

const MAX_IDENTIFIER_CODE_POINTS = 128;

export const fail = (path: string, expectation: string): never => {
  throw new ScienceValidationError(`${path} must be ${expectation}.`);
};

export const assertRecord = (value: unknown, path: string): UnknownRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "an object");
  return value as UnknownRecord;
};

export const assertExactKeys = (value: UnknownRecord, path: string, keys: readonly string[]): void => {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, "unsupported");
};

export const assertString = (value: unknown, path: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) fail(path, "a non-empty string");
  return value as string;
};

export const assertIdentifier = (value: unknown, path: string): string => {
  const identifier = assertString(value, path);
  if (Array.from(identifier).length > MAX_IDENTIFIER_CODE_POINTS) {
    fail(path, `a non-empty string with at most ${MAX_IDENTIFIER_CODE_POINTS} Unicode code points`);
  }
  return identifier;
};

export const assertTimestamp = (value: unknown, path: string): string => {
  const timestamp = assertString(value, path);
  if (!Number.isFinite(Date.parse(timestamp))) fail(path, "an ISO-8601 timestamp");
  return timestamp;
};

export const assertFinite = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "a finite number");
  return value as number;
};

export const assertPositive = (value: unknown, path: string): number => {
  const number = assertFinite(value, path);
  if (number <= 0) fail(path, "greater than zero");
  return number;
};

export const assertNonNegative = (value: unknown, path: string): number => {
  const number = assertFinite(value, path);
  if (number < 0) fail(path, "zero or greater");
  return number;
};

export const assertInteger = (value: unknown, path: string): number => {
  const number = assertFinite(value, path);
  if (!Number.isSafeInteger(number)) fail(path, "a safe integer");
  return number;
};

export const assertEnum = <T extends string>(value: unknown, path: string, allowed: readonly T[]): T => {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(path, `one of ${allowed.join(", ")}`);
  }
  return value as T;
};

export const assertArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) fail(path, "an array");
  return value as unknown[];
};

export const assertUniqueStrings = (values: readonly string[], path: string): void => {
  if (new Set(values).size !== values.length) fail(path, "an array with unique values");
};

export const assertVector3 = (value: unknown, path: string): Vector3 => {
  const values = assertArray(value, path);
  if (values.length !== 3) fail(path, "a three-dimensional vector");
  return [
    assertFinite(values[0], `${path}[0]`),
    assertFinite(values[1], `${path}[1]`),
    assertFinite(values[2], `${path}[2]`),
  ];
};

export const vectorMagnitude = ([x, y, z]: Vector3): number => Math.hypot(x, y, z);
