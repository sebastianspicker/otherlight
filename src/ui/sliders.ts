// src/ui/sliders.ts
//
// Optional: slider mirroring for number inputs.

import { clamp, toFiniteNumber } from "../core/units";
import type { UiRefs } from "./refs";
import { getParamUiMeta } from "./paramValidation";

type WireParamSlidersOptions = {
  signal?: AbortSignal;
};

type NumericInputRange = {
  input: HTMLInputElement;
  min: number;
  max: number;
  step: number;
};

type NumericBounds = {
  min: number;
  max: number;
};

function listenerOptions(signal: AbortSignal | undefined): AddEventListenerOptions | undefined {
  return signal ? { signal } : undefined;
}

function numberInputsInParamForm(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll("#paramForm input[type='number']")) as HTMLInputElement[];
}

function numericBounds(input: HTMLInputElement): NumericBounds | undefined {
  const minAttr = input.getAttribute("min");
  const maxAttr = input.getAttribute("max");
  if (minAttr === null || maxAttr === null) return undefined;

  const min = Number(minAttr);
  const max = Number(maxAttr);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return undefined;

  return { min, max };
}

function numericStep(input: HTMLInputElement, bounds: NumericBounds): number {
  const stepAttr = input.getAttribute("step");
  const fallbackStep = (bounds.max - bounds.min) / 500;
  const step = stepAttr ? Number(stepAttr) : fallbackStep;

  return Number.isFinite(step) && step > 0 ? step : fallbackStep;
}

function numericInputRange(input: HTMLInputElement): NumericInputRange | undefined {
  if (!input.id) return undefined;

  const bounds = numericBounds(input);
  if (!bounds) return undefined;

  return {
    input,
    min: bounds.min,
    max: bounds.max,
    step: numericStep(input, bounds),
  };
}

function dispatchNumberInputEvents(input: HTMLInputElement): void {
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function sliderValueForInput(range: NumericInputRange): string {
  return String(clamp(toFiniteNumber(range.input.value, range.min), range.min, range.max));
}

function createSliderRow(range: NumericInputRange): { row: HTMLDivElement; slider: HTMLInputElement } {
  const row = document.createElement("div");
  row.className = "row";

  const name = document.createElement("div");
  name.className = "name";
  const meta = getParamUiMeta(range.input);
  name.textContent = meta.unit ? `${meta.label} (${meta.unit})` : meta.label;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.id = `slider-${range.input.id}`;
  slider.setAttribute("aria-label", `Adjust ${meta.label}`);
  if (meta.help) slider.title = meta.help;
  slider.min = String(range.min);
  slider.max = String(range.max);
  slider.step = String(range.step);
  slider.value = sliderValueForInput(range);

  row.appendChild(name);
  row.appendChild(slider);

  return { row, slider };
}

function clampedNumberValue(range: NumericInputRange, overrideEnabled: boolean): number | undefined {
  const value = toFiniteNumber(range.input.value, NaN);
  if (!Number.isFinite(value)) return undefined;

  const physicalMin = range.min >= 0 ? 0 : -Infinity;
  return overrideEnabled ? Math.max(physicalMin, value) : clamp(value, range.min, range.max);
}

function syncNumberFromSlider(input: HTMLInputElement, slider: HTMLInputElement): void {
  input.value = slider.value;
  dispatchNumberInputEvents(input);
}

function syncSliderFromNumber(
  range: NumericInputRange,
  slider: HTMLInputElement,
  overrideEnabled: boolean,
): void {
  const value = toFiniteNumber(range.input.value, NaN);
  const clampedValue = clampedNumberValue(range, overrideEnabled);
  if (clampedValue === undefined) return;

  if (!Object.is(clampedValue, value)) {
    range.input.value = String(clampedValue);
  }

  slider.value = String(clamp(clampedValue, range.min, range.max));
}

function wireSliderRow(
  range: NumericInputRange,
  root: HTMLElement,
  overrideEnabled: () => boolean,
  options: AddEventListenerOptions | undefined,
): void {
  const { row, slider } = createSliderRow(range);

  slider.addEventListener("input", () => syncNumberFromSlider(range.input, slider), options);
  range.input.addEventListener(
    "input",
    () => syncSliderFromNumber(range, slider, overrideEnabled()),
    options,
  );

  root.appendChild(row);
}

function clampRangeInput(range: NumericInputRange): void {
  const value = toFiniteNumber(range.input.value, NaN);
  if (!Number.isFinite(value)) return;

  range.input.value = String(clamp(value, range.min, range.max));
  range.input.dispatchEvent(new Event("input", { bubbles: true }));
}

function clampInputsToRanges(ranges: NumericInputRange[]): void {
  for (const range of ranges) {
    clampRangeInput(range);
  }
}

export function wireParamSliders(r: UiRefs, options: WireParamSlidersOptions = {}): void {
  if (!r.sliderRootEl) return;

  const eventOptions = listenerOptions(options.signal);
  const isOverrideOn = () => Boolean(r.overrideModeEl?.checked);
  const ranges = numberInputsInParamForm().flatMap((input) => {
    const range = numericInputRange(input);
    return range ? [range] : [];
  });

  // Keep slider root visible; override changes only clamp policy.
  r.sliderRootEl.style.display = "";
  r.sliderRootEl.replaceChildren();

  for (const range of ranges) {
    wireSliderRow(range, r.sliderRootEl, isOverrideOn, eventOptions);
  }

  r.overrideModeEl?.addEventListener(
    "change",
    () => {
      if (!isOverrideOn()) {
        clampInputsToRanges(ranges);
      }
    },
    eventOptions,
  );
}
