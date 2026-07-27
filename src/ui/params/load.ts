/**
 * Owns load support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import type { SystemParams } from "../../core/types";
import { RAD2DEG } from "../../core/units";
import { writeNumberInput } from "../inputs";
import { getObserverDirForMode, readUiMode } from "../mode";
import type { UiRefs } from "../refs";
import { loadMoonIntoUI, loadPlanetIntoUI } from "./loadBodies";
import { loadNBodyIntoUI } from "./nbody";
import { loadPhotometryIntoUI } from "./photometry";

function valueOr<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

export function loadParamsIntoUI(p: SystemParams, r: UiRefs): void {
  loadObserverAndStarIntoUI(p, r);
  loadPhotometryIntoUI(p, r);
  loadPlanetIntoUI(p, r);
  loadMoonIntoUI(p, r);
  loadExomoonTimingIntoUI(p, r);
  loadNBodyIntoUI(p, r);
  loadRelativityIntoUI(p, r);
}

function loadObserverAndStarIntoUI(p: SystemParams, r: UiRefs): void {
  const od = getObserverDirForMode(p, readUiMode(r.uiModeSelect.value));
  writeNumberInput(r.observerX, od.x);
  writeNumberInput(r.observerY, od.y);
  writeNumberInput(r.observerZ, od.z);
  writeNumberInput(r.starR, p.star.r);
}

function loadExomoonTimingIntoUI(p: SystemParams, r: UiRefs): void {
  const exo = p.dynamics?.exomoonTimingShape;
  r.exoEnabled.checked = Boolean(exo?.enabled);
  writeNumberInput(r.exoTRef, valueOr(exo?.tRef, 0));
  writeNumberInput(r.exoVelDt, valueOr(exo?.velDt, 2));
  writeNumberInput(r.exoMoonOmegaDot, valueOr(exo?.moonOmegaDot, 0));
  writeNumberInput(r.exoMoonIncDot, valueOr(exo?.moonIncDot, 0));
  writeNumberInput(r.exoMoonOmegaSmallDot, valueOr(exo?.moonOmegaSmallDot, 0));
  writeNumberInput(r.exoImpactYDot, valueOr(exo?.moonImpactYDot, 0));
}

function loadRelativityIntoUI(p: SystemParams, r: UiRefs): void {
  const rel = p.dynamics?.relativity;
  r.relEnabled.checked = Boolean(rel?.enabled);
  r.relLTTE.checked = Boolean(valueOr(rel?.ltte, true));
  r.relShapiro.checked = Boolean(valueOr(rel?.shapiro, true));
  r.relGR.checked = Boolean(valueOr(rel?.grPrecession, true));
  writeNumberInput(r.relC, valueOr(rel?.c, 299_792_458));
  writeNumberInput(
    r.relPlanetPrec,
    Number.isFinite(valueOr(rel?.planetPrecessionPerOrbit, Number.NaN))
      ? (rel!.planetPrecessionPerOrbit as number) * RAD2DEG
      : 0,
  );
  writeNumberInput(
    r.relMoonPrec,
    Number.isFinite(valueOr(rel?.moonPrecessionPerOrbit, Number.NaN))
      ? (rel!.moonPrecessionPerOrbit as number) * RAD2DEG
      : 0,
  );
}
