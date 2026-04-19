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
export { createUiRefs, uiRefs } from "./refsObject";
