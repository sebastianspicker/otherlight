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
  viewZoomEnabled: HTMLInputElement | null;
  btnZoomOut: HTMLButtonElement | null;
  btnZoomIn: HTMLButtonElement | null;
  btnZoomReset: HTMLButtonElement | null;
  zoomVal: HTMLElement | null;
  timeSpeed: HTMLInputElement;
  timeSpeedMultiplier: HTMLSelectElement;
  timeSpeedVal: HTMLElement;
  plotMode: HTMLSelectElement | null;
  plotTrackingMode: HTMLSelectElement | null;
  clampSmearedFlux: HTMLInputElement | null;
  viewAutoFit: HTMLInputElement | null;
  tVal: HTMLElement;
  fluxVal: HTMLElement;
  productModeSelect: HTMLSelectElement;
  uiModeSelect: HTMLSelectElement;

  // Presets
  simModeSelect: HTMLSelectElement | null;
  runtimeModeSelect: HTMLSelectElement | null;
  presetSelect: HTMLSelectElement;
  presetDesc: HTMLElement;
  realSystemSelect: HTMLSelectElement | null;
  realSystemMeta: HTMLElement | null;
  skyBlackboxHint: HTMLElement | null;

  // Optional readouts
  plotModeVal: HTMLSpanElement | null;
  warnVal: HTMLSpanElement | null;
  nOccultersVal: HTMLSpanElement | null;
  vPlanetVal: HTMLSpanElement | null;
  vMoonVal: HTMLSpanElement | null;
  timingHistoryVal: HTMLSpanElement | null;
  didLessonStatus: HTMLElement | null;
  didLessonSummary: HTMLElement | null;
  didLessonMeta: HTMLElement | null;
  didPhaseTitle: HTMLElement | null;
  didPhasePrompt: HTMLElement | null;
  didInterpretation: HTMLElement | null;
  didWorkedExample: HTMLElement | null;
  didObservationList: HTMLElement | null;
  didResponseComposer: HTMLElement | null;
  didPrimaryResponseLabel: HTMLElement | null;
  didPrimaryResponseInput: HTMLTextAreaElement | null;
  didSecondaryResponseLabel: HTMLElement | null;
  didSecondaryResponseInput: HTMLTextAreaElement | null;
  didResponseHelp: HTMLElement | null;
  didFocusList: HTMLElement | null;
  didHintList: HTMLElement | null;
  didMisconceptionList: HTMLElement | null;
  didCheckList: HTMLElement | null;
  didFormulaList: HTMLElement | null;
  didCompareOut: HTMLElement | null;
  ocCanvas: HTMLCanvasElement | null;
  ocBodySelect: HTMLSelectElement | null;
  ocUnitSelect: HTMLSelectElement | null;
  ocTrendModeSelect: HTMLSelectElement | null;
  ocExportBtn: HTMLButtonElement | null;
  ocClearBtn: HTMLButtonElement | null;
  ocStatsVal: HTMLElement | null;
  ocFitVal: HTMLElement | null;

  didLessonSelect: HTMLSelectElement | null;
  didPrevBtn: HTMLButtonElement | null;
  didHintLevelSelect: HTMLSelectElement | null;
  didHintLessBtn: HTMLButtonElement | null;
  didHintMoreBtn: HTMLButtonElement | null;
  didEventTargetSelect: HTMLSelectElement | null;
  didJumpEventBtn: HTMLButtonElement | null;
  didAutoAssess: HTMLInputElement | null;
  didCheckBtn: HTMLButtonElement | null;
  didNextBtn: HTMLButtonElement | null;
  didExportBtn: HTMLButtonElement | null;
  didComparePreset: HTMLSelectElement | null;
  didCompareTime: HTMLInputElement | null;
  didCompareBtn: HTMLButtonElement | null;
  didHypothesisSelect: HTMLSelectElement | null;
  didRevealSkyBtn: HTMLButtonElement | null;
  didBinaryControls: HTMLElement | null;

  // Params panel
  btnApplyParams: HTMLButtonElement;
  btnResetParams: HTMLButtonElement;

  observerX: HTMLInputElement;
  observerY: HTMLInputElement;
  observerZ: HTMLInputElement;

  overrideModeEl: HTMLInputElement | null;
  sliderRootEl: HTMLElement | null;
  quickControlsRootEl: HTMLElement | null;
  quickPlanetR: HTMLInputElement;
  quickPlanetRVal: HTMLElement;
  quickPlanetInc: HTMLInputElement;
  quickPlanetIncVal: HTMLElement;
  quickPlanetA: HTMLInputElement;
  quickPlanetAVal: HTMLElement;
  quickMoonEnabled: HTMLInputElement;
  quickMoonR: HTMLInputElement;
  quickMoonRVal: HTMLElement;
  quickMoonA: HTMLInputElement;
  quickMoonAVal: HTMLElement;
  quickMoonInc: HTMLInputElement;
  quickMoonIncVal: HTMLElement;
  quickReflectedLight: HTMLInputElement;

  // STAR core
  starR: HTMLInputElement;
  baselineFlux: HTMLInputElement;
  gridRes: HTMLInputElement;

  // Limb darkening UI
  ldEnabled: HTMLInputElement;
  ldU1: HTMLInputElement;
  ldU2: HTMLInputElement;
  ldBandpass: HTMLInputElement;
  ldBands: HTMLInputElement;

  // Brightness patches
  patchesEnabled: HTMLInputElement;
  spotEvolutionEnabled: HTMLInputElement;
  spotRotationPeriod: HTMLInputElement;
  spotCoverage: HTMLInputElement;
  spotLifetime: HTMLInputElement;
  spotDriftRate: HTMLInputElement;

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
  planetThermalInertiaEnabled: HTMLInputElement;
  planetAlbedo: HTMLInputElement;
  planetEmissivity: HTMLInputElement;
  planetThermalTimescale: HTMLInputElement;
  planetRedistribution: HTMLInputElement;

  // Planet shape / rings
  planetOblateEnabled: HTMLInputElement;
  planetOblateness: HTMLInputElement;
  planetRingsEnabled: HTMLInputElement;
  planetRingInner: HTMLInputElement;
  planetRingOuter: HTMLInputElement;
  planetRingInc: HTMLInputElement;
  planetRingAngle: HTMLInputElement;

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
  atmLambdaNm: HTMLInputElement;
  atmTauScale: HTMLInputElement;

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
  moonThermalInertiaEnabled: HTMLInputElement;
  moonAlbedo: HTMLInputElement;
  moonEmissivity: HTMLInputElement;
  moonThermalTimescale: HTMLInputElement;
  moonRedistribution: HTMLInputElement;

  // Moon shape / rings
  moonOblateEnabled: HTMLInputElement;
  moonOblateness: HTMLInputElement;
  moonRingsEnabled: HTMLInputElement;
  moonRingInner: HTMLInputElement;
  moonRingOuter: HTMLInputElement;
  moonRingInc: HTMLInputElement;
  moonRingAngle: HTMLInputElement;

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

  // N-body dynamics
  nbodyEnabled: HTMLInputElement;
  nbodyMuStar: HTMLInputElement;
  nbodyMuPlanet: HTMLInputElement;
  nbodyMuMoon: HTMLInputElement;
  nbodyDtMax: HTMLInputElement;
  nbodySoftening: HTMLInputElement;
  pert1Enabled: HTMLInputElement;
  pert1Mu: HTMLInputElement;
  pert1A: HTMLInputElement;
  pert1E: HTMLInputElement;
  pert1Inc: HTMLInputElement;
  pert1Period: HTMLInputElement;
  pert2Enabled: HTMLInputElement;
  pert2Mu: HTMLInputElement;
  pert2A: HTMLInputElement;
  pert2E: HTMLInputElement;
  pert2Inc: HTMLInputElement;
  pert2Period: HTMLInputElement;

  // Relativity (LTTE/GR)
  relEnabled: HTMLInputElement;
  relLTTE: HTMLInputElement;
  relShapiro: HTMLInputElement;
  relGR: HTMLInputElement;
  relC: HTMLInputElement;
  relPlanetPrec: HTMLInputElement;
  relMoonPrec: HTMLInputElement;
};

export const uiRefs: UiRefs = {
  // Canvas + core controls
  skyCanvas: mustGetAs("skyCanvas", HTMLCanvasElement),
  lcCanvas: mustGetAs("lcCanvas", HTMLCanvasElement),
  btnStart: mustGetAs("btnStart", HTMLButtonElement),
  btnReset: mustGetAs("btnReset", HTMLButtonElement),
  btnClearLC: mustGetAs("btnClearLC", HTMLButtonElement),
  viewZoomEnabled: document.getElementById("viewZoomEnabled") as HTMLInputElement | null,
  btnZoomOut: document.getElementById("btnZoomOut") as HTMLButtonElement | null,
  btnZoomIn: document.getElementById("btnZoomIn") as HTMLButtonElement | null,
  btnZoomReset: document.getElementById("btnZoomReset") as HTMLButtonElement | null,
  zoomVal: document.getElementById("zoomVal"),
  timeSpeed: mustGetAs("timeSpeed", HTMLInputElement),
  timeSpeedMultiplier: mustGetAs("timeSpeedMultiplier", HTMLSelectElement),
  timeSpeedVal: mustGetAs("timeSpeedVal", HTMLElement),
  plotMode: document.getElementById("plotMode") as HTMLSelectElement | null,
  plotTrackingMode: document.getElementById("plotTrackingMode") as HTMLSelectElement | null,
  clampSmearedFlux: document.getElementById("clampSmearedFlux") as HTMLInputElement | null,
  viewAutoFit: document.getElementById("viewAutoFit") as HTMLInputElement | null,
  tVal: mustGetAs("tVal", HTMLElement),
  fluxVal: mustGetAs("fluxVal", HTMLElement),
  productModeSelect: mustGetAs("productModeSelect", HTMLSelectElement),
  uiModeSelect: mustGetAs("uiModeSelect", HTMLSelectElement),

  // Presets
  simModeSelect: document.getElementById("simModeSelect") as HTMLSelectElement | null,
  runtimeModeSelect: document.getElementById("runtimeModeSelect") as HTMLSelectElement | null,
  presetSelect: mustGetAs("presetSelect", HTMLSelectElement),
  presetDesc: mustGetAs("presetDesc", HTMLElement),
  realSystemSelect: document.getElementById("realSystemSelect") as HTMLSelectElement | null,
  realSystemMeta: document.getElementById("realSystemMeta"),
  skyBlackboxHint: document.getElementById("skyBlackboxHint"),

  // Optional readouts
  plotModeVal: document.getElementById("plotModeVal") as HTMLSpanElement | null,
  warnVal: document.getElementById("warnVal") as HTMLSpanElement | null,
  nOccultersVal: document.getElementById("nOccultersVal") as HTMLSpanElement | null,
  vPlanetVal: document.getElementById("vPlanetVal") as HTMLSpanElement | null,
  vMoonVal: document.getElementById("vMoonVal") as HTMLSpanElement | null,
  timingHistoryVal: document.getElementById("timingHistoryVal") as HTMLSpanElement | null,
  didLessonStatus: document.getElementById("didLessonStatus"),
  didLessonSummary: document.getElementById("didLessonSummary"),
  didLessonMeta: document.getElementById("didLessonMeta"),
  didPhaseTitle: document.getElementById("didPhaseTitle"),
  didPhasePrompt: document.getElementById("didPhasePrompt"),
  didInterpretation: document.getElementById("didInterpretation"),
  didWorkedExample: document.getElementById("didWorkedExample"),
  didObservationList: document.getElementById("didObservationList"),
  didResponseComposer: document.getElementById("didResponseComposer"),
  didPrimaryResponseLabel: document.getElementById("didPrimaryResponseLabel"),
  didPrimaryResponseInput: document.getElementById("didPrimaryResponseInput") as HTMLTextAreaElement | null,
  didSecondaryResponseLabel: document.getElementById("didSecondaryResponseLabel"),
  didSecondaryResponseInput: document.getElementById(
    "didSecondaryResponseInput",
  ) as HTMLTextAreaElement | null,
  didResponseHelp: document.getElementById("didResponseHelp"),
  didFocusList: document.getElementById("didFocusList"),
  didHintList: document.getElementById("didHintList"),
  didMisconceptionList: document.getElementById("didMisconceptionList"),
  didCheckList: document.getElementById("didCheckList"),
  didFormulaList: document.getElementById("didFormulaList"),
  didCompareOut: document.getElementById("didCompareOut"),
  ocCanvas: document.getElementById("ocCanvas") as HTMLCanvasElement | null,
  ocBodySelect: document.getElementById("ocBodySelect") as HTMLSelectElement | null,
  ocUnitSelect: document.getElementById("ocUnitSelect") as HTMLSelectElement | null,
  ocTrendModeSelect: document.getElementById("ocTrendModeSelect") as HTMLSelectElement | null,
  ocExportBtn: document.getElementById("ocExportBtn") as HTMLButtonElement | null,
  ocClearBtn: document.getElementById("ocClearBtn") as HTMLButtonElement | null,
  ocStatsVal: document.getElementById("ocStatsVal"),
  ocFitVal: document.getElementById("ocFitVal"),
  didLessonSelect: document.getElementById("didLessonSelect") as HTMLSelectElement | null,
  didPrevBtn: document.getElementById("didPrevBtn") as HTMLButtonElement | null,
  didHintLevelSelect: document.getElementById("didHintLevelSelect") as HTMLSelectElement | null,
  didHintLessBtn: document.getElementById("didHintLessBtn") as HTMLButtonElement | null,
  didHintMoreBtn: document.getElementById("didHintMoreBtn") as HTMLButtonElement | null,
  didEventTargetSelect: document.getElementById("didEventTargetSelect") as HTMLSelectElement | null,
  didJumpEventBtn: document.getElementById("didJumpEventBtn") as HTMLButtonElement | null,
  didAutoAssess: document.getElementById("didAutoAssess") as HTMLInputElement | null,
  didCheckBtn: document.getElementById("didCheckBtn") as HTMLButtonElement | null,
  didNextBtn: document.getElementById("didNextBtn") as HTMLButtonElement | null,
  didExportBtn: document.getElementById("didExportBtn") as HTMLButtonElement | null,
  didComparePreset: document.getElementById("didComparePreset") as HTMLSelectElement | null,
  didCompareTime: document.getElementById("didCompareTime") as HTMLInputElement | null,
  didCompareBtn: document.getElementById("didCompareBtn") as HTMLButtonElement | null,
  didHypothesisSelect: document.getElementById("didHypothesisSelect") as HTMLSelectElement | null,
  didRevealSkyBtn: document.getElementById("didRevealSkyBtn") as HTMLButtonElement | null,
  didBinaryControls: document.getElementById("didBinaryControls"),

  // Params panel
  btnApplyParams: mustGetAs("btnApplyParams", HTMLButtonElement),
  btnResetParams: mustGetAs("btnResetParams", HTMLButtonElement),

  observerX: mustGetAs("observerX", HTMLInputElement),
  observerY: mustGetAs("observerY", HTMLInputElement),
  observerZ: mustGetAs("observerZ", HTMLInputElement),

  overrideModeEl: document.getElementById("overrideMode") as HTMLInputElement | null,
  sliderRootEl: document.getElementById("sliderRoot") as HTMLElement | null,
  quickControlsRootEl: document.getElementById("quickControlsRoot") as HTMLElement | null,
  quickPlanetR: mustGetAs("quickPlanetR", HTMLInputElement),
  quickPlanetRVal: mustGetAs("quickPlanetRVal", HTMLElement),
  quickPlanetInc: mustGetAs("quickPlanetInc", HTMLInputElement),
  quickPlanetIncVal: mustGetAs("quickPlanetIncVal", HTMLElement),
  quickPlanetA: mustGetAs("quickPlanetA", HTMLInputElement),
  quickPlanetAVal: mustGetAs("quickPlanetAVal", HTMLElement),
  quickMoonEnabled: mustGetAs("quickMoonEnabled", HTMLInputElement),
  quickMoonR: mustGetAs("quickMoonR", HTMLInputElement),
  quickMoonRVal: mustGetAs("quickMoonRVal", HTMLElement),
  quickMoonA: mustGetAs("quickMoonA", HTMLInputElement),
  quickMoonAVal: mustGetAs("quickMoonAVal", HTMLElement),
  quickMoonInc: mustGetAs("quickMoonInc", HTMLInputElement),
  quickMoonIncVal: mustGetAs("quickMoonIncVal", HTMLElement),
  quickReflectedLight: mustGetAs("quickReflectedLight", HTMLInputElement),

  // STAR core
  starR: mustGetAs("starR", HTMLInputElement),
  baselineFlux: mustGetAs("baselineFlux", HTMLInputElement),
  gridRes: mustGetAs("gridRes", HTMLInputElement),

  // Limb darkening UI
  ldEnabled: mustGetAs("ldEnabled", HTMLInputElement),
  ldU1: mustGetAs("ldU1", HTMLInputElement),
  ldU2: mustGetAs("ldU2", HTMLInputElement),
  ldBandpass: mustGetAs("ldBandpass", HTMLInputElement),
  ldBands: mustGetAs("ldBands", HTMLInputElement),

  // Brightness patches
  patchesEnabled: mustGetAs("patchesEnabled", HTMLInputElement),
  spotEvolutionEnabled: mustGetAs("spotEvolutionEnabled", HTMLInputElement),
  spotRotationPeriod: mustGetAs("spotRotationPeriod", HTMLInputElement),
  spotCoverage: mustGetAs("spotCoverage", HTMLInputElement),
  spotLifetime: mustGetAs("spotLifetime", HTMLInputElement),
  spotDriftRate: mustGetAs("spotDriftRate", HTMLInputElement),

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
  planetThermalInertiaEnabled: mustGetAs("planetThermalInertiaEnabled", HTMLInputElement),
  planetAlbedo: mustGetAs("planetAlbedo", HTMLInputElement),
  planetEmissivity: mustGetAs("planetEmissivity", HTMLInputElement),
  planetThermalTimescale: mustGetAs("planetThermalTimescale", HTMLInputElement),
  planetRedistribution: mustGetAs("planetRedistribution", HTMLInputElement),

  // Planet shape / rings
  planetOblateEnabled: mustGetAs("planetOblateEnabled", HTMLInputElement),
  planetOblateness: mustGetAs("planetOblateness", HTMLInputElement),
  planetRingsEnabled: mustGetAs("planetRingsEnabled", HTMLInputElement),
  planetRingInner: mustGetAs("planetRingInner", HTMLInputElement),
  planetRingOuter: mustGetAs("planetRingOuter", HTMLInputElement),
  planetRingInc: mustGetAs("planetRingInc", HTMLInputElement),
  planetRingAngle: mustGetAs("planetRingAngle", HTMLInputElement),

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
  atmLambdaNm: mustGetAs("atmLambdaNm", HTMLInputElement),
  atmTauScale: mustGetAs("atmTauScale", HTMLInputElement),

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
  moonThermalInertiaEnabled: mustGetAs("moonThermalInertiaEnabled", HTMLInputElement),
  moonAlbedo: mustGetAs("moonAlbedo", HTMLInputElement),
  moonEmissivity: mustGetAs("moonEmissivity", HTMLInputElement),
  moonThermalTimescale: mustGetAs("moonThermalTimescale", HTMLInputElement),
  moonRedistribution: mustGetAs("moonRedistribution", HTMLInputElement),

  // Moon shape / rings
  moonOblateEnabled: mustGetAs("moonOblateEnabled", HTMLInputElement),
  moonOblateness: mustGetAs("moonOblateness", HTMLInputElement),
  moonRingsEnabled: mustGetAs("moonRingsEnabled", HTMLInputElement),
  moonRingInner: mustGetAs("moonRingInner", HTMLInputElement),
  moonRingOuter: mustGetAs("moonRingOuter", HTMLInputElement),
  moonRingInc: mustGetAs("moonRingInc", HTMLInputElement),
  moonRingAngle: mustGetAs("moonRingAngle", HTMLInputElement),

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

  // N-body dynamics
  nbodyEnabled: mustGetAs("nbodyEnabled", HTMLInputElement),
  nbodyMuStar: mustGetAs("nbodyMuStar", HTMLInputElement),
  nbodyMuPlanet: mustGetAs("nbodyMuPlanet", HTMLInputElement),
  nbodyMuMoon: mustGetAs("nbodyMuMoon", HTMLInputElement),
  nbodyDtMax: mustGetAs("nbodyDtMax", HTMLInputElement),
  nbodySoftening: mustGetAs("nbodySoftening", HTMLInputElement),
  pert1Enabled: mustGetAs("pert1Enabled", HTMLInputElement),
  pert1Mu: mustGetAs("pert1Mu", HTMLInputElement),
  pert1A: mustGetAs("pert1A", HTMLInputElement),
  pert1E: mustGetAs("pert1E", HTMLInputElement),
  pert1Inc: mustGetAs("pert1Inc", HTMLInputElement),
  pert1Period: mustGetAs("pert1Period", HTMLInputElement),
  pert2Enabled: mustGetAs("pert2Enabled", HTMLInputElement),
  pert2Mu: mustGetAs("pert2Mu", HTMLInputElement),
  pert2A: mustGetAs("pert2A", HTMLInputElement),
  pert2E: mustGetAs("pert2E", HTMLInputElement),
  pert2Inc: mustGetAs("pert2Inc", HTMLInputElement),
  pert2Period: mustGetAs("pert2Period", HTMLInputElement),

  // Relativity (LTTE/GR)
  relEnabled: mustGetAs("relEnabled", HTMLInputElement),
  relLTTE: mustGetAs("relLTTE", HTMLInputElement),
  relShapiro: mustGetAs("relShapiro", HTMLInputElement),
  relGR: mustGetAs("relGR", HTMLInputElement),
  relC: mustGetAs("relC", HTMLInputElement),
  relPlanetPrec: mustGetAs("relPlanetPrec", HTMLInputElement),
  relMoonPrec: mustGetAs("relMoonPrec", HTMLInputElement),
};
