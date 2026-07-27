/**
 * Owns quick Controls support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import { setText } from "../core/dom";
import { toFiniteNumber } from "../core/units";
import { muFromPeriodAndA } from "../physics/kepler";
import type { UiRefs } from "./refs";

export type QuickControlsOptions = {
  onQuickControlChange?: () => void;
  signal?: AbortSignal;
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

function safeMuFromOrbit(aInput: HTMLInputElement, periodInput: HTMLInputElement): number | undefined {
  const a = toFiniteNumber(aInput.value, Number.NaN);
  const period = toFiniteNumber(periodInput.value, Number.NaN);
  if (!(Number.isFinite(a) && a > 0 && Number.isFinite(period) && period > 0)) return undefined;
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
  if (!(Number.isFinite(mu) && mu !== undefined && mu > 0 && Number.isFinite(nextA) && nextA > 0)) {
    return undefined;
  }
  const period = 2 * Math.PI * Math.sqrt((nextA * nextA * nextA) / mu);
  return Number.isFinite(period) && period > 0 ? period : undefined;
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

  copyRangeMeta(r.quickPlanetR, r.planetR);
  copyRangeMeta(r.quickPlanetInc, r.planetInc);
  copyRangeMeta(r.quickPlanetA, r.planetA);
  copyRangeMeta(r.quickMoonR, r.moonR);
  copyRangeMeta(r.quickMoonA, r.moonA);
  copyRangeMeta(r.quickMoonInc, r.moonInc);

  r.quickPlanetR.addEventListener(
    "input",
    () => {
      setNumberInputValue(
        r.planetR,
        toFiniteNumber(r.quickPlanetR.value, toFiniteNumber(r.planetR.value, 0)),
      );
      notifyChange();
    },
    listenerOptions,
  );

  r.quickPlanetInc.addEventListener(
    "input",
    () => {
      setNumberInputValue(
        r.planetInc,
        toFiniteNumber(r.quickPlanetInc.value, toFiniteNumber(r.planetInc.value, 0)),
      );
      notifyChange();
    },
    listenerOptions,
  );

  r.quickPlanetA.addEventListener(
    "input",
    () => {
      const nextA = toFiniteNumber(r.quickPlanetA.value, toFiniteNumber(r.planetA.value, 0));
      const nextPeriod = deriveConsistentPeriod(r.planetA, r.planetPeriod, nextA);
      r.planetA.value = String(nextA);
      dispatchInputAndChange(r.planetA);
      if (nextPeriod !== undefined) {
        r.planetPeriod.value = String(nextPeriod);
        dispatchInputAndChange(r.planetPeriod);
      }
      notifyChange();
    },
    listenerOptions,
  );

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

  r.quickMoonR.addEventListener(
    "input",
    () => {
      setNumberInputValue(r.moonR, toFiniteNumber(r.quickMoonR.value, toFiniteNumber(r.moonR.value, 0)));
      notifyChange();
    },
    listenerOptions,
  );

  r.quickMoonA.addEventListener(
    "input",
    () => {
      const nextA = toFiniteNumber(r.quickMoonA.value, toFiniteNumber(r.moonA.value, 0));
      const nextPeriod = deriveConsistentPeriod(r.moonA, r.moonPeriod, nextA);
      r.moonA.value = String(nextA);
      dispatchInputAndChange(r.moonA);
      if (nextPeriod !== undefined) {
        r.moonPeriod.value = String(nextPeriod);
        dispatchInputAndChange(r.moonPeriod);
      }
      notifyChange();
    },
    listenerOptions,
  );

  r.quickMoonInc.addEventListener(
    "input",
    () => {
      setNumberInputValue(
        r.moonInc,
        toFiniteNumber(r.quickMoonInc.value, toFiniteNumber(r.moonInc.value, 0)),
      );
      notifyChange();
    },
    listenerOptions,
  );

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
  for (const control of rawControls) {
    control.addEventListener("input", syncFromRaw, listenerOptions);
    control.addEventListener("change", syncFromRaw, listenerOptions);
  }

  syncQuickControlsFromInputs(r);
}
