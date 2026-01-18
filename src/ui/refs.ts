// src/ui/refs.ts
//
// Centralized DOM references for the UI.

import { mustGetAs } from "../core/dom";

export type UiRefs = {
  // Canvas + core controls
  skyCanvas: HTMLCanvasElement;
  lcCanvas: HTMLCanvasElement;
  btnStart: HTMLButtonElement;
  btnReset: HTMLButtonElement;
  btnClearLC: HTMLButtonElement;
  timeSpeed: HTMLInputElement;
  timeSpeedVal: HTMLElement;
  tVal: HTMLElement;
  fluxVal: HTMLElement;

  // Optional readouts
  plotModeVal: HTMLSpanElement | null;
  warnVal: HTMLSpanElement | null;
  nOccultersVal: HTMLSpanElement | null;
  vPlanetVal: HTMLSpanElement | null;
  vMoonVal: HTMLSpanElement | null;

  // Params panel
  btnApplyParams: HTMLButtonElement;
  btnResetParams: HTMLButtonElement;

  observerX: HTMLInputElement;
  observerY: HTMLInputElement;
  observerZ: HTMLInputElement;

  overrideModeEl: HTMLInputElement | null;
  sliderRootEl: HTMLElement | null;

  // STAR core
  starR: HTMLInputElement;
  baselineFlux: HTMLInputElement;
  gridRes: HTMLInputElement;

  // Limb darkening UI
  ldEnabled: HTMLInputElement;
  ldU1: HTMLInputElement;
  ldU2: HTMLInputElement;

  // Brightness patches
  patchesEnabled: HTMLInputElement;

  // Patch 1 circle
  p1x: HTMLInputElement;
  p1y: HTMLInputElement;
  p1r: HTMLInputElement;
  p1f: HTMLInputElement;

  // Patch 2 ellipse
  p2x: HTMLInputElement;
  p2y: HTMLInputElement;
  p2rx: HTMLInputElement;
  p2ry: HTMLInputElement;
  p2angle: HTMLInputElement;
  p2f: HTMLInputElement;

  // PLANET core + mass
  planetR: HTMLInputElement;
  planetA: HTMLInputElement;
  planetE: HTMLInputElement;
  planetInc: HTMLInputElement;
  planetPeriod: HTMLInputElement;
  planetMass: HTMLInputElement;

  // Planet phase curve
  planetPhaseEnabled: HTMLInputElement;
  planetReflAmp: HTMLInputElement;
  planetThermAmp: HTMLInputElement;
  planetReflOffset: HTMLInputElement;
  planetThermOffset: HTMLInputElement;
  planetLambertian: HTMLInputElement;
  planetConstant: HTMLInputElement;

  // Forward scattering
  fsEnabled: HTMLInputElement;
  fsAmp: HTMLInputElement;
  fsG: HTMLInputElement;
  fsSigma: HTMLInputElement;
  fsOffset: HTMLInputElement;
  fsGateBehind: HTMLInputElement;

  // Atmosphere transmission
  atmEnabled: HTMLInputElement;
  atmKind: HTMLSelectElement;
  atmR0: HTMLInputElement;
  atmH: HTMLInputElement;
  atmTau0: HTMLInputElement;

  // MOON core + mass
  moonEnabled: HTMLInputElement;
  moonR: HTMLInputElement;
  moonA: HTMLInputElement;
  moonE: HTMLInputElement;
  moonInc: HTMLInputElement;
  moonPeriod: HTMLInputElement;
  moonMass: HTMLInputElement;

  // Moon phase curve
  moonPhaseEnabled: HTMLInputElement;
  moonReflAmp: HTMLInputElement;
  moonThermAmp: HTMLInputElement;
  moonLambertian: HTMLInputElement;

  // Observation measurement / smearing
  smearEnabled: HTMLInputElement;
  cadenceSec: HTMLInputElement;
  nSubsamples: HTMLInputElement;

  // Stellar variability
  varEnabled: HTMLInputElement;
  beamingAmp: HTMLInputElement;
  ellipsoidalAmp: HTMLInputElement;
  beamingOffset: HTMLInputElement;
  ellipsoidalOffset: HTMLInputElement;
  varConstant: HTMLInputElement;

  // Day/night visibility (hook)
  dnEnabled: HTMLInputElement;
  dnClamp: HTMLInputElement;
  dnReflectedModel: HTMLSelectElement;
  dnThermalModel: HTMLSelectElement;

  // Exomoon timing/shape diagnostics (dynamics hook)
  exoEnabled: HTMLInputElement;
  exoTRef: HTMLInputElement;
  exoVelDt: HTMLInputElement;
  exoMoonOmegaDot: HTMLInputElement;
  exoMoonIncDot: HTMLInputElement;
  exoMoonOmegaSmallDot: HTMLInputElement;
  exoImpactYDot: HTMLInputElement;
};

export const uiRefs: UiRefs = {
  // Canvas + core controls
  skyCanvas: mustGetAs("skyCanvas", HTMLCanvasElement),
  lcCanvas: mustGetAs("lcCanvas", HTMLCanvasElement),
  btnStart: mustGetAs("btnStart", HTMLButtonElement),
  btnReset: mustGetAs("btnReset", HTMLButtonElement),
  btnClearLC: mustGetAs("btnClearLC", HTMLButtonElement),
  timeSpeed: mustGetAs("timeSpeed", HTMLInputElement),
  timeSpeedVal: mustGetAs("timeSpeedVal", HTMLElement),
  tVal: mustGetAs("tVal", HTMLElement),
  fluxVal: mustGetAs("fluxVal", HTMLElement),

  // Optional readouts
  plotModeVal: document.getElementById("plotModeVal") as HTMLSpanElement | null,
  warnVal: document.getElementById("warnVal") as HTMLSpanElement | null,
  nOccultersVal: document.getElementById("nOccultersVal") as HTMLSpanElement | null,
  vPlanetVal: document.getElementById("vPlanetVal") as HTMLSpanElement | null,
  vMoonVal: document.getElementById("vMoonVal") as HTMLSpanElement | null,

  // Params panel
  btnApplyParams: mustGetAs("btnApplyParams", HTMLButtonElement),
  btnResetParams: mustGetAs("btnResetParams", HTMLButtonElement),

  observerX: mustGetAs("observerX", HTMLInputElement),
  observerY: mustGetAs("observerY", HTMLInputElement),
  observerZ: mustGetAs("observerZ", HTMLInputElement),

  overrideModeEl: document.getElementById("overrideMode") as HTMLInputElement | null,
  sliderRootEl: document.getElementById("sliderRoot") as HTMLElement | null,

  // STAR core
  starR: mustGetAs("starR", HTMLInputElement),
  baselineFlux: mustGetAs("baselineFlux", HTMLInputElement),
  gridRes: mustGetAs("gridRes", HTMLInputElement),

  // Limb darkening UI
  ldEnabled: mustGetAs("ldEnabled", HTMLInputElement),
  ldU1: mustGetAs("ldU1", HTMLInputElement),
  ldU2: mustGetAs("ldU2", HTMLInputElement),

  // Brightness patches
  patchesEnabled: mustGetAs("patchesEnabled", HTMLInputElement),

  // Patch 1 circle
  p1x: mustGetAs("p1x", HTMLInputElement),
  p1y: mustGetAs("p1y", HTMLInputElement),
  p1r: mustGetAs("p1r", HTMLInputElement),
  p1f: mustGetAs("p1f", HTMLInputElement),

  // Patch 2 ellipse
  p2x: mustGetAs("p2x", HTMLInputElement),
  p2y: mustGetAs("p2y", HTMLInputElement),
  p2rx: mustGetAs("p2rx", HTMLInputElement),
  p2ry: mustGetAs("p2ry", HTMLInputElement),
  p2angle: mustGetAs("p2angle", HTMLInputElement),
  p2f: mustGetAs("p2f", HTMLInputElement),

  // PLANET core + mass
  planetR: mustGetAs("planetR", HTMLInputElement),
  planetA: mustGetAs("planetA", HTMLInputElement),
  planetE: mustGetAs("planetE", HTMLInputElement),
  planetInc: mustGetAs("planetInc", HTMLInputElement),
  planetPeriod: mustGetAs("planetPeriod", HTMLInputElement),
  planetMass: mustGetAs("planetMass", HTMLInputElement),

  // Planet phase curve
  planetPhaseEnabled: mustGetAs("planetPhaseEnabled", HTMLInputElement),
  planetReflAmp: mustGetAs("planetReflAmp", HTMLInputElement),
  planetThermAmp: mustGetAs("planetThermAmp", HTMLInputElement),
  planetReflOffset: mustGetAs("planetReflOffset", HTMLInputElement),
  planetThermOffset: mustGetAs("planetThermOffset", HTMLInputElement),
  planetLambertian: mustGetAs("planetLambertian", HTMLInputElement),
  planetConstant: mustGetAs("planetConstant", HTMLInputElement),

  // Forward scattering
  fsEnabled: mustGetAs("fsEnabled", HTMLInputElement),
  fsAmp: mustGetAs("fsAmp", HTMLInputElement),
  fsG: mustGetAs("fsG", HTMLInputElement),
  fsSigma: mustGetAs("fsSigma", HTMLInputElement),
  fsOffset: mustGetAs("fsOffset", HTMLInputElement),
  fsGateBehind: mustGetAs("fsGateBehind", HTMLInputElement),

  // Atmosphere transmission
  atmEnabled: mustGetAs("atmEnabled", HTMLInputElement),
  atmKind: mustGetAs("atmKind", HTMLSelectElement),
  atmR0: mustGetAs("atmR0", HTMLInputElement),
  atmH: mustGetAs("atmH", HTMLInputElement),
  atmTau0: mustGetAs("atmTau0", HTMLInputElement),

  // MOON core + mass
  moonEnabled: mustGetAs("moonEnabled", HTMLInputElement),
  moonR: mustGetAs("moonR", HTMLInputElement),
  moonA: mustGetAs("moonA", HTMLInputElement),
  moonE: mustGetAs("moonE", HTMLInputElement),
  moonInc: mustGetAs("moonInc", HTMLInputElement),
  moonPeriod: mustGetAs("moonPeriod", HTMLInputElement),
  moonMass: mustGetAs("moonMass", HTMLInputElement),

  // Moon phase curve
  moonPhaseEnabled: mustGetAs("moonPhaseEnabled", HTMLInputElement),
  moonReflAmp: mustGetAs("moonReflAmp", HTMLInputElement),
  moonThermAmp: mustGetAs("moonThermAmp", HTMLInputElement),
  moonLambertian: mustGetAs("moonLambertian", HTMLInputElement),

  // Observation measurement / smearing
  smearEnabled: mustGetAs("smearEnabled", HTMLInputElement),
  cadenceSec: mustGetAs("cadenceSec", HTMLInputElement),
  nSubsamples: mustGetAs("nSubsamples", HTMLInputElement),

  // Stellar variability
  varEnabled: mustGetAs("varEnabled", HTMLInputElement),
  beamingAmp: mustGetAs("beamingAmp", HTMLInputElement),
  ellipsoidalAmp: mustGetAs("ellipsoidalAmp", HTMLInputElement),
  beamingOffset: mustGetAs("beamingOffset", HTMLInputElement),
  ellipsoidalOffset: mustGetAs("ellipsoidalOffset", HTMLInputElement),
  varConstant: mustGetAs("varConstant", HTMLInputElement),

  // Day/night visibility (hook)
  dnEnabled: mustGetAs("dnEnabled", HTMLInputElement),
  dnClamp: mustGetAs("dnClamp", HTMLInputElement),
  dnReflectedModel: mustGetAs("dnReflectedModel", HTMLSelectElement),
  dnThermalModel: mustGetAs("dnThermalModel", HTMLSelectElement),

  // Exomoon timing/shape diagnostics (dynamics hook)
  exoEnabled: mustGetAs("exoEnabled", HTMLInputElement),
  exoTRef: mustGetAs("exoTRef", HTMLInputElement),
  exoVelDt: mustGetAs("exoVelDt", HTMLInputElement),
  exoMoonOmegaDot: mustGetAs("exoMoonOmegaDot", HTMLInputElement),
  exoMoonIncDot: mustGetAs("exoMoonIncDot", HTMLInputElement),
  exoMoonOmegaSmallDot: mustGetAs("exoMoonOmegaSmallDot", HTMLInputElement),
  exoImpactYDot: mustGetAs("exoImpactYDot", HTMLInputElement),
};
