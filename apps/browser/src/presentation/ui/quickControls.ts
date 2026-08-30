/**
 * Owns quick Controls support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import { setText } from "./dom";
import { toFiniteNumber } from "../../domain/model/units";
import { muFromPeriodAndA } from "../../domain/orbits/kepler";
import type { UiRefs } from "./refs";

export type QuickControlsOptions = {
  onQuickControlChange?: () => void;
  signal?: AbortSignal;
};

type QuickRangeBinding = {
  quick: HTMLInputElement;
  source: HTMLInputElement;
};

function copyRangeMeta(quick: HTMLInputElement, source: HTMLInputElement): void {
  const min = source.getAttribute("min");
  const max = source.getAttribute("max");
  const step = source.getAttribute("step");
  if (min !== null) quick.min = min;
  if (max !== null) quick.max = max;
  if (step !== null) quick.step = step;
}

function dispatchInputAndChange(input: HTMLInputElement): void {
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNumberInputValue(input: HTMLInputElement, next: number): void {
  input.value = String(next);
  dispatchInputAndChange(input);
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  if (value === undefined) return false;
  if (!Number.isFinite(value)) return false;
  return value > 0;
}

function safeMuFromOrbit(aInput: HTMLInputElement, periodInput: HTMLInputElement): number | undefined {
  const a = toFiniteNumber(aInput.value, Number.NaN);
  const period = toFiniteNumber(periodInput.value, Number.NaN);
  if (!isPositiveFiniteNumber(a) || !isPositiveFiniteNumber(period)) return undefined;
  try {
    return muFromPeriodAndA(period, a);
  } catch {
    return undefined;
  }
}

function deriveConsistentPeriod(
  aInput: HTMLInputElement,
  periodInput: HTMLInputElement,
  nextA: number,
): number | undefined {
  const mu = safeMuFromOrbit(aInput, periodInput);
  if (!isPositiveFiniteNumber(mu) || !isPositiveFiniteNumber(nextA)) return undefined;
  const period = 2 * Math.PI * Math.sqrt((nextA * nextA * nextA) / mu);
  return isPositiveFiniteNumber(period) ? period : undefined;
}

function formatDistanceMeters(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)} Gm`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)} Mm`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)} km`;
  return `${value.toFixed(0)} m`;
}

function formatDegrees(value: number): string {
  return `${value.toFixed(1)} deg`;
}

function syncQuickRange(
  quick: HTMLInputElement,
  source: HTMLInputElement,
  readout: HTMLElement,
  formatter: (value: number) => string,
): void {
  const value = toFiniteNumber(source.value, Number.NaN);
  if (!Number.isFinite(value)) return;
  quick.value = String(value);
  setText(readout, formatter(value));
}

function syncQuickCheckbox(quick: HTMLInputElement, checked: boolean): void {
  quick.checked = checked;
}

function syncMoonQuickState(r: UiRefs): void {
  const enabled = r.moonEnabled.checked;
  r.quickMoonR.disabled = !enabled;
  r.quickMoonA.disabled = !enabled;
  r.quickMoonInc.disabled = !enabled;
  r.quickMoonEnabled.checked = enabled;
  r.quickMoonR.setAttribute("aria-disabled", enabled ? "false" : "true");
  r.quickMoonA.setAttribute("aria-disabled", enabled ? "false" : "true");
  r.quickMoonInc.setAttribute("aria-disabled", enabled ? "false" : "true");
}

function copyQuickRangeMetadata(bindings: readonly QuickRangeBinding[]): void {
  for (const { quick, source } of bindings) copyRangeMeta(quick, source);
}

function wireQuickRangeBinding(
  binding: QuickRangeBinding,
  notifyChange: () => void,
  listenerOptions: AddEventListenerOptions | undefined,
): void {
  const { quick, source } = binding;
  quick.addEventListener(
    "input",
    () => {
      setNumberInputValue(source, toFiniteNumber(quick.value, toFiniteNumber(source.value, 0)));
      notifyChange();
    },
    listenerOptions,
  );
}

function wireQuickOrbitBinding(
  quick: HTMLInputElement,
  aInput: HTMLInputElement,
  periodInput: HTMLInputElement,
  notifyChange: () => void,
  listenerOptions: AddEventListenerOptions | undefined,
): void {
  quick.addEventListener(
    "input",
    () => {
      const nextA = toFiniteNumber(quick.value, toFiniteNumber(aInput.value, 0));
      const nextPeriod = deriveConsistentPeriod(aInput, periodInput, nextA);
      aInput.value = String(nextA);
      dispatchInputAndChange(aInput);
      if (nextPeriod !== undefined) {
        periodInput.value = String(nextPeriod);
        dispatchInputAndChange(periodInput);
      }
      notifyChange();
    },
    listenerOptions,
  );
}

function wireRawQuickSynchronizers(
  rawControls: readonly HTMLInputElement[],
  syncFromRaw: () => void,
  listenerOptions: AddEventListenerOptions | undefined,
): void {
  for (const control of rawControls) {
    control.addEventListener("input", syncFromRaw, listenerOptions);
    control.addEventListener("change", syncFromRaw, listenerOptions);
  }
}

export function syncQuickControlsFromInputs(r: UiRefs): void {
  if (!r.quickControlsRootEl) return;

  syncQuickRange(r.quickPlanetR, r.planetR, r.quickPlanetRVal, formatDistanceMeters);
  syncQuickRange(r.quickPlanetInc, r.planetInc, r.quickPlanetIncVal, formatDegrees);
  syncQuickRange(r.quickPlanetA, r.planetA, r.quickPlanetAVal, formatDistanceMeters);
  syncQuickRange(r.quickMoonR, r.moonR, r.quickMoonRVal, formatDistanceMeters);
  syncQuickRange(r.quickMoonA, r.moonA, r.quickMoonAVal, formatDistanceMeters);
  syncQuickRange(r.quickMoonInc, r.moonInc, r.quickMoonIncVal, formatDegrees);

  syncMoonQuickState(r);
  syncQuickCheckbox(
    r.quickReflectedLight,
    r.planetPhaseEnabled.checked || r.moonPhaseEnabled.checked || r.dnEnabled.checked,
  );
}

export function wireNormalModeQuickControls(r: UiRefs, options: QuickControlsOptions = {}): void {
  if (!r.quickControlsRootEl) return;
  const notifyChange = () => options.onQuickControlChange?.();
  const listenerOptions = options.signal ? { signal: options.signal } : undefined;
  const planetRadiusBinding = { quick: r.quickPlanetR, source: r.planetR };
  const planetInclinationBinding = { quick: r.quickPlanetInc, source: r.planetInc };
  const moonRadiusBinding = { quick: r.quickMoonR, source: r.moonR };
  const moonInclinationBinding = { quick: r.quickMoonInc, source: r.moonInc };

  copyQuickRangeMetadata([
    planetRadiusBinding,
    planetInclinationBinding,
    { quick: r.quickPlanetA, source: r.planetA },
    moonRadiusBinding,
    { quick: r.quickMoonA, source: r.moonA },
    moonInclinationBinding,
  ]);

  wireQuickRangeBinding(planetRadiusBinding, notifyChange, listenerOptions);
  wireQuickRangeBinding(planetInclinationBinding, notifyChange, listenerOptions);
  wireQuickOrbitBinding(r.quickPlanetA, r.planetA, r.planetPeriod, notifyChange, listenerOptions);

  r.quickMoonEnabled.addEventListener(
    "change",
    () => {
      r.moonEnabled.checked = r.quickMoonEnabled.checked;
      dispatchInputAndChange(r.moonEnabled);
      syncMoonQuickState(r);
      notifyChange();
    },
    listenerOptions,
  );

  wireQuickRangeBinding(moonRadiusBinding, notifyChange, listenerOptions);
  wireQuickOrbitBinding(r.quickMoonA, r.moonA, r.moonPeriod, notifyChange, listenerOptions);
  wireQuickRangeBinding(moonInclinationBinding, notifyChange, listenerOptions);

  r.quickReflectedLight.addEventListener(
    "change",
    () => {
      const enabled = r.quickReflectedLight.checked;
      r.planetPhaseEnabled.checked = enabled;
      dispatchInputAndChange(r.planetPhaseEnabled);
      r.moonPhaseEnabled.checked = enabled;
      dispatchInputAndChange(r.moonPhaseEnabled);
      r.dnEnabled.checked = enabled;
      dispatchInputAndChange(r.dnEnabled);
      notifyChange();
    },
    listenerOptions,
  );

  const syncFromRaw = () => syncQuickControlsFromInputs(r);
  const rawControls: HTMLInputElement[] = [
    r.planetR,
    r.planetInc,
    r.planetA,
    r.planetPeriod,
    r.moonEnabled,
    r.moonR,
    r.moonA,
    r.moonInc,
    r.moonPeriod,
    r.planetPhaseEnabled,
    r.moonPhaseEnabled,
    r.dnEnabled,
  ];
  wireRawQuickSynchronizers(rawControls, syncFromRaw, listenerOptions);

  syncQuickControlsFromInputs(r);
}
