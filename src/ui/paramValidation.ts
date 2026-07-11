import type { SystemParams } from "../core/types";
import type { UiRefs } from "./refs";
import { readUIIntoParams } from "./params/read";

export type ParamUiMeta = {
  id: string;
  label: string;
  group: string;
  unit?: string;
  min?: number;
  max?: number;
  help?: string;
};

export type ParamValidationError = {
  fieldId: string;
  label: string;
  message: string;
};

export type ParamReadResult =
  | { ok: true; params: SystemParams }
  | { ok: false; errors: ParamValidationError[] };

const LABEL_OVERRIDES: Record<string, string> = {
  starR: "Star radius",
  baselineFlux: "Baseline flux",
  gridRes: "Stellar grid resolution",
  planetR: "Planet radius",
  planetA: "Planet semi-major axis",
  planetE: "Planet eccentricity",
  planetInc: "Planet inclination",
  planetPeriod: "Planet orbital period",
  planetMass: "Planet mass",
  moonR: "Moon radius",
  moonA: "Moon semi-major axis",
  moonE: "Moon eccentricity",
  moonInc: "Moon inclination",
  moonPeriod: "Moon orbital period",
  moonMass: "Moon mass",
  cadenceSec: "Measurement cadence",
  nSubsamples: "Measurement sub-samples",
  observerX: "Observer direction x",
  observerY: "Observer direction y",
  observerZ: "Observer direction z",
  planetRingInner: "Planet ring inner radius",
  planetRingOuter: "Planet ring outer radius",
  moonRingInner: "Moon ring inner radius",
  moonRingOuter: "Moon ring outer radius",
};

const HARD_POSITIVE_IDS = new Set([
  "starR",
  "planetR",
  "planetA",
  "planetPeriod",
  "moonR",
  "moonA",
  "moonPeriod",
  "relC",
  "exoVelDt",
]);

const normalizedText = (value: string | null | undefined): string => {
  return (value ?? "").replace(/\s+/g, " ").trim();
};

const labelTextForInput = (input: HTMLInputElement): string => {
  const override = LABEL_OVERRIDES[input.id];
  if (override) return override;
  const explicit = normalizedText(input.getAttribute("aria-label"));
  if (explicit) return explicit;
  const label = input.closest("label");
  if (label) {
    // Form controls do not contribute their current value to textContent, so
    // reading the label directly avoids cloning a large expert form per field.
    const text = normalizedText(label.textContent?.replace(/\b(?:is required|must be).*/i, ""));
    if (text) return text;
  }
  return "Scientific parameter";
};

const finiteAttribute = (input: HTMLInputElement, name: "min" | "max"): number | undefined => {
  const raw = input.getAttribute(name);
  if (raw === null) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const inputGroup = (input: HTMLInputElement): string => {
  const fieldset = input.closest("fieldset");
  const legend = fieldset?.querySelector(":scope > legend")?.textContent;
  return normalizedText(legend) || "Parameters";
};

const inputUnit = (rawLabel: string): string | undefined => {
  const unitMatch = rawLabel.match(/\[([^\]]+)\]|\(([^)]+)\)\s*$/);
  const unit = unitMatch?.[1] ?? unitMatch?.[2];
  return normalizedText(unit) || undefined;
};

const inputHelp = (input: HTMLInputElement): string | undefined => {
  const help = input.closest("[data-tooltip]")?.getAttribute("data-tooltip");
  return normalizedText(help) || undefined;
};

export const getParamUiMeta = (input: HTMLInputElement): ParamUiMeta => {
  const rawLabel = labelTextForInput(input);
  return {
    id: input.id,
    label: rawLabel,
    group: inputGroup(input),
    unit: inputUnit(rawLabel),
    min: finiteAttribute(input, "min"),
    max: finiteAttribute(input, "max"),
    help: inputHelp(input),
  };
};

function inputError(input: HTMLInputElement, overrideRanges: boolean): ParamValidationError | undefined {
  const raw = input.value.trim();
  const value = input.valueAsNumber;
  const createError = (message: (label: string) => string): ParamValidationError => {
    const label = getParamUiMeta(input).label;
    return { fieldId: input.id, label, message: message(label) };
  };
  if (!raw) return createError((label) => `${label} is required.`);
  if (!Number.isFinite(value)) {
    return createError((label) => `${label} must be a finite number.`);
  }
  if (HARD_POSITIVE_IDS.has(input.id) && value <= 0) {
    return createError((label) => `${label} must be greater than 0.`);
  }
  if ((input.id === "planetE" || input.id === "moonE") && (value < 0 || value > 0.95)) {
    return createError((label) => `${label} must be between 0 and 0.95 for a stable elliptic orbit.`);
  }
  if (input.id === "nSubsamples" && !Number.isInteger(value)) {
    return createError((label) => `${label} must be a whole number.`);
  }
  const min = finiteAttribute(input, "min");
  const max = finiteAttribute(input, "max");
  if (!overrideRanges && min !== undefined && value < min) {
    return createError((label) => `${label} must be at least ${min}.`);
  }
  if (!overrideRanges && max !== undefined && value > max) {
    return createError((label) => `${label} must be no more than ${max}.`);
  }
  return undefined;
}

function compatibilityErrors(form: HTMLFormElement): ParamValidationError[] {
  const errors: ParamValidationError[] = [];
  const number = (id: string) => (form.elements.namedItem(id) as HTMLInputElement | null)?.valueAsNumber;
  const checked = (id: string) => Boolean((form.elements.namedItem(id) as HTMLInputElement | null)?.checked);
  const addOuterError = (enabledId: string, innerId: string, outerId: string, body: string) => {
    if (!checked(enabledId)) return;
    const inner = number(innerId);
    const outer = number(outerId);
    if (Number.isFinite(inner) && Number.isFinite(outer) && (outer as number) <= (inner as number)) {
      errors.push({
        fieldId: outerId,
        label: `${body} ring outer radius`,
        message: `${body} ring outer radius must be greater than its inner radius.`,
      });
    }
  };
  addOuterError("planetRingsEnabled", "planetRingInner", "planetRingOuter", "Planet");
  addOuterError("moonRingsEnabled", "moonRingInner", "moonRingOuter", "Moon");

  const uiMode = (document.getElementById("uiModeSelect") as HTMLSelectElement | null)?.value;
  if (uiMode === "expert") {
    const x = number("observerX");
    const y = number("observerY");
    const z = number("observerZ");
    if (x === 0 && y === 0 && z === 0) {
      errors.push({
        fieldId: "observerX",
        label: "Observer direction",
        message: "Observer direction must contain at least one non-zero component.",
      });
    }
  }
  return errors;
}

export function validateParamForm(form: HTMLFormElement): ParamValidationError[] {
  const overrideRanges = Boolean(
    (form.elements.namedItem("overrideMode") as HTMLInputElement | null)?.checked,
  );
  const errors = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="number"]'))
    .filter((input) => !input.disabled)
    .flatMap((input) => {
      const error = inputError(input, overrideRanges);
      return error ? [error] : [];
    });
  return [...errors, ...compatibilityErrors(form)];
}

export function readValidatedUIIntoParams(
  current: SystemParams,
  refs: UiRefs,
  scenarioDefaults: SystemParams,
  form: HTMLFormElement,
): ParamReadResult {
  const errors = validateParamForm(form);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, params: readUIIntoParams(current, refs, scenarioDefaults) };
}

export function clearParamValidationUi(form: HTMLFormElement, summary: HTMLElement | null): void {
  for (const input of form.querySelectorAll<HTMLInputElement>('[aria-invalid="true"]')) {
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  }
  for (const error of form.querySelectorAll(".field-error")) error.remove();
  if (summary) {
    summary.replaceChildren();
    summary.hidden = true;
  }
}

export function renderParamValidationErrors(
  form: HTMLFormElement,
  errors: ParamValidationError[],
  summary: HTMLElement | null,
): void {
  clearParamValidationUi(form, summary);
  for (const error of errors) {
    const input = form.elements.namedItem(error.fieldId);
    if (!(input instanceof HTMLInputElement)) continue;
    const errorId = `${error.fieldId}-error`;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", errorId);
    const message = document.createElement("span");
    message.id = errorId;
    message.className = "field-error";
    message.textContent = error.message;
    input.insertAdjacentElement("afterend", message);
  }
  if (summary) {
    const heading = document.createElement("strong");
    heading.textContent = `${errors.length} parameter ${errors.length === 1 ? "error" : "errors"} must be fixed:`;
    const list = document.createElement("ul");
    for (const error of errors) {
      const item = document.createElement("li");
      item.textContent = error.message;
      list.appendChild(item);
    }
    summary.append(heading, list);
    summary.hidden = false;
    summary.focus();
  }
  const first = form.elements.namedItem(errors[0]?.fieldId ?? "");
  if (first instanceof HTMLInputElement) first.focus();
}
