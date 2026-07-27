/**
 * Owns enable Sections support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import { setDisabled } from "../core/dom";
import type { UiRefs } from "./refs";

export function syncMoonInputsEnabled(r: UiRefs): void {
  const en = r.moonEnabled.checked;

  setDisabled(r.moonR, !en);
  setDisabled(r.moonA, !en);
  setDisabled(r.moonE, !en);
  setDisabled(r.moonInc, !en);
  setDisabled(r.moonPeriod, !en);
  setDisabled(r.moonMass, !en);

  setDisabled(r.moonOblateEnabled, !en);
  setDisabled(r.moonRingsEnabled, !en);

  setDisabled(r.moonPhaseEnabled, !en);
  setDisabled(r.moonReflAmp, !en || !r.moonPhaseEnabled.checked);
  setDisabled(r.moonThermAmp, !en || !r.moonPhaseEnabled.checked);
  setDisabled(r.moonLambertian, !en || !r.moonPhaseEnabled.checked);

  setDisabled(r.moonThermalInertiaEnabled, !en || !r.moonPhaseEnabled.checked);
  const tiOn = en && r.moonPhaseEnabled.checked && r.moonThermalInertiaEnabled.checked;
  setDisabled(r.moonAlbedo, !tiOn);
  setDisabled(r.moonEmissivity, !tiOn);
  setDisabled(r.moonThermalTimescale, !tiOn);
  setDisabled(r.moonRedistribution, !tiOn);
}

export function syncLDInputsEnabled(r: UiRefs): void {
  const en = r.ldEnabled.checked;
  setDisabled(r.ldU1, !en);
  setDisabled(r.ldU2, !en);
  setDisabled(r.ldBandpass, !en);
  setDisabled(r.ldBands, !en);
}

export function syncPatchInputsEnabled(r: UiRefs): void {
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

export function syncSpotEvolutionEnabled(r: UiRefs): void {
  const en = r.spotEvolutionEnabled.checked;
  setDisabled(r.spotRotationPeriod, !en);
  setDisabled(r.spotCoverage, !en);
  setDisabled(r.spotLifetime, !en);
  setDisabled(r.spotDriftRate, !en);
}

export function syncPlanetPhaseEnabled(r: UiRefs): void {
  const en = r.planetPhaseEnabled.checked;

  setDisabled(r.planetReflAmp, !en);
  setDisabled(r.planetThermAmp, !en);
  setDisabled(r.planetReflOffset, !en);
  setDisabled(r.planetThermOffset, !en);
  setDisabled(r.planetLambertian, !en);
  setDisabled(r.planetConstant, !en);

  setDisabled(r.planetThermalInertiaEnabled, !en);
  const tiOn = en && r.planetThermalInertiaEnabled.checked;
  setDisabled(r.planetAlbedo, !tiOn);
  setDisabled(r.planetEmissivity, !tiOn);
  setDisabled(r.planetThermalTimescale, !tiOn);
  setDisabled(r.planetRedistribution, !tiOn);
}

export function syncPlanetShapeEnabled(r: UiRefs): void {
  const oblateOn = r.planetOblateEnabled.checked;
  const ringsOn = r.planetRingsEnabled.checked;

  setDisabled(r.planetOblateness, !oblateOn);

  setDisabled(r.planetRingInner, !ringsOn);
  setDisabled(r.planetRingOuter, !ringsOn);
  setDisabled(r.planetRingInc, !ringsOn);
  setDisabled(r.planetRingAngle, !ringsOn);
}

export function syncMoonShapeEnabled(r: UiRefs): void {
  const en = r.moonEnabled.checked;
  const oblateOn = en && r.moonOblateEnabled.checked;
  const ringsOn = en && r.moonRingsEnabled.checked;

  setDisabled(r.moonOblateness, !oblateOn);

  setDisabled(r.moonRingInner, !ringsOn);
  setDisabled(r.moonRingOuter, !ringsOn);
  setDisabled(r.moonRingInc, !ringsOn);
  setDisabled(r.moonRingAngle, !ringsOn);
}

export function syncFSEnabled(r: UiRefs): void {
  const en = r.fsEnabled.checked;
  setDisabled(r.fsEnabled, false);
  setDisabled(r.fsAmp, !en);
  setDisabled(r.fsG, !en);
  setDisabled(r.fsSigma, !en);
  setDisabled(r.fsOffset, !en);
  setDisabled(r.fsGateBehind, !en);
}

export function syncAtmEnabled(r: UiRefs): void {
  const en = r.atmEnabled.checked;

  setDisabled(r.atmKind, !en);
  setDisabled(r.atmR0, !en);
  setDisabled(r.atmH, !en);
  setDisabled(r.atmTau0, !en);
  setDisabled(r.atmLambdaNm, !en);
  setDisabled(r.atmTauScale, !en);
}

export function syncSmearEnabled(r: UiRefs): void {
  const en = r.smearEnabled.checked;

  setDisabled(r.cadenceSec, !en);
  setDisabled(r.nSubsamples, !en);
}

export function syncVarEnabled(r: UiRefs): void {
  const en = r.varEnabled.checked;

  setDisabled(r.beamingAmp, !en);
  setDisabled(r.ellipsoidalAmp, !en);
  setDisabled(r.beamingOffset, !en);
  setDisabled(r.ellipsoidalOffset, !en);
  setDisabled(r.varConstant, !en);
}

export function syncDnEnabled(r: UiRefs): void {
  const en = r.dnEnabled.checked;

  setDisabled(r.dnClamp, !en);
  setDisabled(r.dnReflectedModel, !en);
  setDisabled(r.dnThermalModel, !en);
}

export function syncExoEnabled(r: UiRefs): void {
  const en = r.exoEnabled.checked;

  setDisabled(r.exoTRef, !en);
  setDisabled(r.exoVelDt, !en);
  setDisabled(r.exoMoonOmegaDot, !en);
  setDisabled(r.exoMoonIncDot, !en);
  setDisabled(r.exoMoonOmegaSmallDot, !en);
  setDisabled(r.exoImpactYDot, !en);
}

export function syncNBodyEnabled(r: UiRefs): void {
  const moonOn = r.moonEnabled.checked;
  setDisabled(r.nbodyEnabled, !moonOn);

  const en = moonOn && r.nbodyEnabled.checked;

  setDisabled(r.nbodyMuStar, !en);
  setDisabled(r.nbodyMuPlanet, !en);
  setDisabled(r.nbodyMuMoon, !en);
  setDisabled(r.nbodyDtMax, !en);
  setDisabled(r.nbodySoftening, !en);

  setDisabled(r.pert1Enabled, !en);
  setDisabled(r.pert2Enabled, !en);

  const p1On = en && r.pert1Enabled.checked;
  setDisabled(r.pert1Mu, !p1On);
  setDisabled(r.pert1A, !p1On);
  setDisabled(r.pert1E, !p1On);
  setDisabled(r.pert1Inc, !p1On);
  setDisabled(r.pert1Period, !p1On);

  const p2On = en && r.pert2Enabled.checked;
  setDisabled(r.pert2Mu, !p2On);
  setDisabled(r.pert2A, !p2On);
  setDisabled(r.pert2E, !p2On);
  setDisabled(r.pert2Inc, !p2On);
  setDisabled(r.pert2Period, !p2On);
}

export function syncRelativityEnabled(r: UiRefs): void {
  const en = r.relEnabled.checked;

  setDisabled(r.relLTTE, !en);
  setDisabled(r.relShapiro, !en);
  setDisabled(r.relGR, !en);
  setDisabled(r.relC, !en);
  setDisabled(r.relPlanetPrec, !en);
  setDisabled(r.relMoonPrec, !en);
}
