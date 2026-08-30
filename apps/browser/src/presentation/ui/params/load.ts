/**
 * Owns load support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import type { BrowserScenarioDraft } from "../../../domain/model/types";
import { writeNumberInput } from "../inputs";
import { getObserverDirForMode, readUiMode } from "../mode";
import type { UiRefs } from "../refs";
import { loadMoonIntoUI, loadPlanetIntoUI } from "./loadBodies";
import { loadPhotometryIntoUI } from "./photometry";

function valueOr<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

export function loadParamsIntoUI(p: BrowserScenarioDraft, r: UiRefs): void {
  loadObserverAndStarIntoUI(p, r);
  loadPhotometryIntoUI(p, r);
  loadPlanetIntoUI(p, r);
  loadMoonIntoUI(p, r);
  loadExomoonTimingIntoUI(p, r);
}

function loadObserverAndStarIntoUI(p: BrowserScenarioDraft, r: UiRefs): void {
  const od = getObserverDirForMode(p, readUiMode(r.uiModeSelect.value));
  writeNumberInput(r.observerX, od.x);
  writeNumberInput(r.observerY, od.y);
  writeNumberInput(r.observerZ, od.z);
  writeNumberInput(r.starR, p.star.r);
}

function loadExomoonTimingIntoUI(p: BrowserScenarioDraft, r: UiRefs): void {
  const exo = p.dynamics?.exomoonTimingShape;
  r.exoEnabled.checked = Boolean(exo?.enabled);
  writeNumberInput(r.exoTRef, valueOr(exo?.tRef, 0));
  writeNumberInput(r.exoVelDt, valueOr(exo?.velDt, 2));
  writeNumberInput(r.exoMoonOmegaDot, valueOr(exo?.moonOmegaDot, 0));
  writeNumberInput(r.exoMoonIncDot, valueOr(exo?.moonIncDot, 0));
  writeNumberInput(r.exoMoonOmegaSmallDot, valueOr(exo?.moonOmegaSmallDot, 0));
  writeNumberInput(r.exoImpactYDot, valueOr(exo?.moonImpactYDot, 0));
}
