/**
 * Shareable product context, kept separate from DOM and browser-history wiring.
 * Consumers can pass the resulting URLSearchParams to history.pushState or
 * history.replaceState as appropriate for the interaction that changed it.
 */
import {
  DEFAULT_LAB_SYSTEM,
  getLabSystemByControlValue,
  isLabSystemId,
  type LabSystemId,
} from "../core/labs";

export type ProductViewProfile = "education" | "scientific";
export type ProductViewMode = "simulation" | "lab";
export type ProductViewUi = "essential" | "advanced";
export type ProductViewSource = "preset" | "real";
export type ProductViewLab = LabSystemId;
export type ProductViewRuntime = "interactive" | "reference";

export type ProductViewState = {
  profile: ProductViewProfile;
  mode: ProductViewMode;
  ui: ProductViewUi;
  source: ProductViewSource;
  scenario: string;
  lab: ProductViewLab;
  lesson: string;
  runtime: ProductViewRuntime;
};

export type ProductViewStateParseResult = {
  state: ProductViewState;
  corrections: string[];
};

export const DEFAULT_PRODUCT_VIEW_STATE: ProductViewState = {
  profile: "education",
  mode: "simulation",
  ui: "essential",
  source: "preset",
  scenario: "default",
  lab: DEFAULT_LAB_SYSTEM.id,
  lesson: "kepler-geometry",
  runtime: "interactive",
};

/** True when a value is safe to use as a stable preset, system, or lesson ID. */
export function isStableProductViewId(value: string): boolean {
  if (value.length === 0 || value.length > 128) return false;
  if (value.startsWith("-") || value.endsWith("-") || value.includes("--")) return false;
  return /^[a-z0-9-]+$/.test(value);
}

function enumValue<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
  corrections: string[],
): T {
  const value = params.get(key);
  if (value === null) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  corrections.push(`Unknown ${key} value ${JSON.stringify(value)}; using ${JSON.stringify(fallback)}.`);
  return fallback;
}

function stableIdValue(
  params: URLSearchParams,
  key: "scenario" | "lesson",
  fallback: string,
  corrections: string[],
): string {
  const value = params.get(key);
  if (value === null) return fallback;
  if (isStableProductViewId(value)) return value;
  corrections.push(`Invalid ${key} ID ${JSON.stringify(value)}; using ${JSON.stringify(fallback)}.`);
  return fallback;
}

/**
 * Read product context from a query string without touching browser globals.
 * Invalid known values are replaced with defaults and described in corrections.
 */
export function parseProductViewState(params: URLSearchParams): ProductViewStateParseResult {
  const corrections: string[] = [];
  const state: ProductViewState = {
    profile: enumValue(
      params,
      "profile",
      ["education", "scientific"],
      DEFAULT_PRODUCT_VIEW_STATE.profile,
      corrections,
    ),
    mode: enumValue(params, "mode", ["simulation", "lab"], DEFAULT_PRODUCT_VIEW_STATE.mode, corrections),
    ui: enumValue(params, "ui", ["essential", "advanced"], DEFAULT_PRODUCT_VIEW_STATE.ui, corrections),
    source: enumValue(params, "source", ["preset", "real"], DEFAULT_PRODUCT_VIEW_STATE.source, corrections),
    scenario: stableIdValue(params, "scenario", DEFAULT_PRODUCT_VIEW_STATE.scenario, corrections),
    lab: labSystemValue(params, corrections),
    lesson: stableIdValue(params, "lesson", DEFAULT_PRODUCT_VIEW_STATE.lesson, corrections),
    runtime: enumValue(
      params,
      "runtime",
      ["interactive", "reference"],
      DEFAULT_PRODUCT_VIEW_STATE.runtime,
      corrections,
    ),
  };
  return { state, corrections };
}

/**
 * Apply a complete state to query parameters in place. Only product keys are
 * changed, so callers retain campaign tags, anchors, and future query fields.
 */
export function applyProductViewState(params: URLSearchParams, state: ProductViewState): URLSearchParams {
  params.set("profile", state.profile);
  params.set("mode", state.mode);
  params.set("ui", state.ui);
  params.set("source", state.source);
  params.set("scenario", state.scenario);
  params.set("lab", state.lab);
  params.set("lesson", state.lesson);
  params.set("runtime", state.runtime);
  return params;
}

function labSystemValue(params: URLSearchParams, corrections: string[]): ProductViewLab {
  const value = params.get("lab");
  if (value === null) return DEFAULT_PRODUCT_VIEW_STATE.lab;
  if (isLabSystemId(value)) return value;
  // Preserve alpha URLs created before lab systems became catalog entries.
  if (value === "preset" || value === "binary") {
    return getLabSystemByControlValue(value === "binary" ? "binary-lab" : "preset-lab").id;
  }
  corrections.push(
    `Unknown lab value ${JSON.stringify(value)}; using ${JSON.stringify(DEFAULT_PRODUCT_VIEW_STATE.lab)}.`,
  );
  return DEFAULT_PRODUCT_VIEW_STATE.lab;
}

/**
 * Copy existing parameters and apply product state, preserving unrelated keys.
 */
export function serializeProductViewState(
  state: ProductViewState,
  existing: URLSearchParams | string = new URLSearchParams(),
): URLSearchParams {
  const params = new URLSearchParams(existing);
  return applyProductViewState(params, state);
}

/** A query-string form suitable for History API URL construction. */
export function productViewStateSearch(
  state: ProductViewState,
  existing: URLSearchParams | string = new URLSearchParams(),
): string {
  return serializeProductViewState(state, existing).toString();
}
