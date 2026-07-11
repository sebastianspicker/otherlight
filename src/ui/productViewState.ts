/**
 * Shareable product context, kept separate from DOM and browser-history wiring.
 * Consumers can pass the resulting URLSearchParams to history.pushState or
 * history.replaceState as appropriate for the interaction that changed it.
 */
export type ProductViewMode = "simulation" | "lab";
export type ProductViewUi = "essential" | "advanced";
export type ProductViewSource = "preset" | "real";
export type ProductViewLab = "preset" | "binary";
export type ProductViewRuntime = "interactive" | "reference";

export type ProductViewState = {
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
  mode: "simulation",
  ui: "essential",
  source: "preset",
  scenario: "default",
  lab: "preset",
  lesson: "kepler-geometry",
  runtime: "interactive",
};

const STABLE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True when a value is safe to use as a stable preset, system, or lesson ID. */
export function isStableProductViewId(value: string): boolean {
  return value.length <= 128 && STABLE_ID_PATTERN.test(value);
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
    mode: enumValue(params, "mode", ["simulation", "lab"], DEFAULT_PRODUCT_VIEW_STATE.mode, corrections),
    ui: enumValue(params, "ui", ["essential", "advanced"], DEFAULT_PRODUCT_VIEW_STATE.ui, corrections),
    source: enumValue(params, "source", ["preset", "real"], DEFAULT_PRODUCT_VIEW_STATE.source, corrections),
    scenario: stableIdValue(params, "scenario", DEFAULT_PRODUCT_VIEW_STATE.scenario, corrections),
    lab: enumValue(params, "lab", ["preset", "binary"], DEFAULT_PRODUCT_VIEW_STATE.lab, corrections),
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
  params.set("mode", state.mode);
  params.set("ui", state.ui);
  params.set("source", state.source);
  params.set("scenario", state.scenario);
  params.set("lab", state.lab);
  params.set("lesson", state.lesson);
  params.set("runtime", state.runtime);
  return params;
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
