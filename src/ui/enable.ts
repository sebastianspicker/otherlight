// src/ui/enable.ts
//
// Live enable/disable helpers for UI sections.

import { setDisabled } from "../core/dom";
import type { UiRefs } from "./refs";

function syncMoonInputsEnabled(r: UiRefs): void {
  const en = r.moonEnabled.checked;

  setDisabled(r.moonR, !en);
  setDisabled(r.moonA, !en);
  setDisabled(r.moonE, !en);
  setDisabled(r.moonInc, !en);
  setDisabled(r.moonPeriod, !en);
  setDisabled(r.moonMass, !en);

  setDisabled(r.moonPhaseEnabled, !en);
  setDisabled(r.moonReflAmp, !en || !r.moonPhaseEnabled.checked);
  setDisabled(r.moonThermAmp, !en || !r.moonPhaseEnabled.checked);
  setDisabled(r.moonLambertian, !en || !r.moonPhaseEnabled.checked);
}

function syncLDInputsEnabled(r: UiRefs): void {
  const en = r.ldEnabled.checked;
  setDisabled(r.ldU1, !en);
  setDisabled(r.ldU2, !en);
}

function syncPatchInputsEnabled(r: UiRefs): void {
  const en = r.patchesEnabled.checked;

  setDisabled(r.p1x, !en);
  setDisabled(r.p1y, !en);
  setDisabled(r.p1r, !en);
  setDisabled(r.p1f, !en);

  setDisabled(r.p2x, !en);
  setDisabled(r.p2y, !en);
  setDisabled(r.p2rx, !en);
  setDisabled(r.p2ry, !en);
  setDisabled(r.p2angle, !en);
  setDisabled(r.p2f, !en);
}

function syncPlanetPhaseEnabled(r: UiRefs): void {
  const en = r.planetPhaseEnabled.checked;

  setDisabled(r.planetReflAmp, !en);
  setDisabled(r.planetThermAmp, !en);
  setDisabled(r.planetReflOffset, !en);
  setDisabled(r.planetThermOffset, !en);
  setDisabled(r.planetLambertian, !en);
  setDisabled(r.planetConstant, !en);
}

function syncFSEnabled(r: UiRefs): void {
  const en = r.fsEnabled.checked;

  setDisabled(r.fsAmp, !en);
  setDisabled(r.fsG, !en);
  setDisabled(r.fsSigma, !en);
  setDisabled(r.fsOffset, !en);
  setDisabled(r.fsGateBehind, !en);
}

function syncAtmEnabled(r: UiRefs): void {
  const en = r.atmEnabled.checked;

  setDisabled(r.atmKind, !en);
  setDisabled(r.atmR0, !en);
  setDisabled(r.atmH, !en);
  setDisabled(r.atmTau0, !en);
}

function syncSmearEnabled(r: UiRefs): void {
  const en = r.smearEnabled.checked;

  setDisabled(r.cadenceSec, !en);
  setDisabled(r.nSubsamples, !en);
}

function syncVarEnabled(r: UiRefs): void {
  const en = r.varEnabled.checked;

  setDisabled(r.beamingAmp, !en);
  setDisabled(r.ellipsoidalAmp, !en);
  setDisabled(r.beamingOffset, !en);
  setDisabled(r.ellipsoidalOffset, !en);
  setDisabled(r.varConstant, !en);
}

function syncDnEnabled(r: UiRefs): void {
  const en = r.dnEnabled.checked;

  setDisabled(r.dnClamp, !en);
  setDisabled(r.dnReflectedModel, !en);
  setDisabled(r.dnThermalModel, !en);
}

function syncExoEnabled(r: UiRefs): void {
  const en = r.exoEnabled.checked;

  setDisabled(r.exoTRef, !en);
  setDisabled(r.exoVelDt, !en);
  setDisabled(r.exoMoonOmegaDot, !en);
  setDisabled(r.exoMoonIncDot, !en);
  setDisabled(r.exoMoonOmegaSmallDot, !en);
  setDisabled(r.exoImpactYDot, !en);
}

export function syncAllEnableStates(r: UiRefs): void {
  syncMoonInputsEnabled(r);
  syncLDInputsEnabled(r);
  syncPatchInputsEnabled(r);
  syncPlanetPhaseEnabled(r);
  syncFSEnabled(r);
  syncAtmEnabled(r);
  syncSmearEnabled(r);
  syncVarEnabled(r);
  syncDnEnabled(r);
  syncExoEnabled(r);
}

export function wireEnableHandlers(r: UiRefs): void {
  r.moonEnabled.addEventListener("change", () => syncAllEnableStates(r));
  r.moonPhaseEnabled.addEventListener("change", () => syncAllEnableStates(r));
  r.ldEnabled.addEventListener("change", () => syncAllEnableStates(r));
  r.patchesEnabled.addEventListener("change", () => syncAllEnableStates(r));
  r.planetPhaseEnabled.addEventListener("change", () => syncAllEnableStates(r));
  r.fsEnabled.addEventListener("change", () => syncAllEnableStates(r));
  r.atmEnabled.addEventListener("change", () => syncAllEnableStates(r));
  r.smearEnabled.addEventListener("change", () => syncAllEnableStates(r));
  r.varEnabled.addEventListener("change", () => syncAllEnableStates(r));
  r.dnEnabled.addEventListener("change", () => syncAllEnableStates(r));
  r.exoEnabled.addEventListener("change", () => syncAllEnableStates(r));

  syncAllEnableStates(r);
}
