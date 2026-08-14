/**
 * Owns refs Object support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import { mustGetAs } from "../core/dom";
import type { UiRefs } from "./refs";

type RefConstructor = new () => HTMLElement;

const uiRefSpec =
  "skyCanvas:HTMLCanvasElement|lcCanvas:HTMLCanvasElement|btnStart:HTMLButtonElement|btnReset:HTMLButtonElement|btnClearLC:HTMLButtonElement|viewZoomEnabled:optional|btnZoomOut:optional|btnZoomIn:optional|btnZoomReset:optional|zoomVal:optional|timeSpeed:HTMLInputElement|timeSpeedMultiplier:HTMLSelectElement|timeSpeedVal:HTMLElement|plotMode:optional|plotTrackingMode:optional|clampSmearedFlux:optional|viewAutoFit:optional|tVal:HTMLElement|fluxVal:HTMLElement|productProfileSelect:HTMLSelectElement|productModeSelect:HTMLSelectElement|uiModeSelect:HTMLSelectElement|simModeSelect:optional|runtimeModeSelect:optional|presetSelect:HTMLSelectElement|presetDesc:HTMLElement|realSystemSelect:optional|realSystemMeta:optional|skyBlackboxHint:optional|plotModeVal:optional|warnVal:optional|nOccultersVal:optional|vPlanetVal:optional|vMoonVal:optional|timingHistoryVal:optional|didLessonStatus:optional|didLessonSummary:optional|didLessonMeta:optional|didPhaseTitle:optional|didPhasePrompt:optional|didInterpretation:optional|didWorkedExample:optional|didObservationList:optional|didResponseComposer:optional|didPrimaryResponseLabel:optional|didPrimaryResponseInput:optional|didSecondaryResponseLabel:optional|didSecondaryResponseInput:optional|didResponseHelp:optional|didFocusList:optional|didHintList:optional|didMisconceptionList:optional|didCheckList:optional|didFormulaList:optional|didCompareOut:optional|ocCanvas:optional|ocBodySelect:optional|ocUnitSelect:optional|ocTrendModeSelect:optional|ocExportBtn:optional|ocClearBtn:optional|ocStatsVal:optional|ocFitVal:optional|didLessonSelect:optional|didPrevBtn:optional|didHintLevelSelect:optional|didHintLessBtn:optional|didHintMoreBtn:optional|didEventTargetSelect:optional|didJumpEventBtn:optional|didAutoAssess:optional|didCheckBtn:optional|didNextBtn:optional|didExportBtn:optional|didComparePreset:optional|didCompareTime:optional|didCompareBtn:optional|didHypothesisSelect:optional|didRevealSkyBtn:optional|didBinaryControls:optional|btnApplyParams:HTMLButtonElement|btnResetParams:HTMLButtonElement|overrideModeEl>overrideMode:optional|sliderRootEl>sliderRoot:optional|quickControlsRootEl>quickControlsRoot:optional|quickPlanetR:HTMLInputElement|quickPlanetRVal:HTMLElement|quickPlanetInc:HTMLInputElement|quickPlanetIncVal:HTMLElement|quickPlanetA:HTMLInputElement|quickPlanetAVal:HTMLElement|quickMoonEnabled:HTMLInputElement|quickMoonR:HTMLInputElement|quickMoonRVal:HTMLElement|quickMoonA:HTMLInputElement|quickMoonAVal:HTMLElement|quickMoonInc:HTMLInputElement|quickMoonIncVal:HTMLElement|quickReflectedLight:HTMLInputElement|observerX:HTMLInputElement|observerY:HTMLInputElement|observerZ:HTMLInputElement|starR:HTMLInputElement|baselineFlux:HTMLInputElement|gridRes:HTMLInputElement|ldEnabled:HTMLInputElement|ldU1:HTMLInputElement|ldU2:HTMLInputElement|ldBandpass:HTMLInputElement|ldBands:HTMLInputElement|patchesEnabled:HTMLInputElement|spotEvolutionEnabled:HTMLInputElement|spotRotationPeriod:HTMLInputElement|spotCoverage:HTMLInputElement|spotLifetime:HTMLInputElement|spotDriftRate:HTMLInputElement|p1x:HTMLInputElement|p1y:HTMLInputElement|p1r:HTMLInputElement|p1f:HTMLInputElement|p2x:HTMLInputElement|p2y:HTMLInputElement|p2rx:HTMLInputElement|p2ry:HTMLInputElement|p2angle:HTMLInputElement|p2f:HTMLInputElement|planetR:HTMLInputElement|planetA:HTMLInputElement|planetE:HTMLInputElement|planetInc:HTMLInputElement|planetPeriod:HTMLInputElement|planetMass:HTMLInputElement|planetPhaseEnabled:HTMLInputElement|planetReflAmp:HTMLInputElement|planetThermAmp:HTMLInputElement|planetReflOffset:HTMLInputElement|planetThermOffset:HTMLInputElement|planetLambertian:HTMLInputElement|planetConstant:HTMLInputElement|planetThermalInertiaEnabled:HTMLInputElement|planetAlbedo:HTMLInputElement|planetEmissivity:HTMLInputElement|planetThermalTimescale:HTMLInputElement|planetRedistribution:HTMLInputElement|planetOblateEnabled:HTMLInputElement|planetOblateness:HTMLInputElement|planetRingsEnabled:HTMLInputElement|planetRingInner:HTMLInputElement|planetRingOuter:HTMLInputElement|planetRingInc:HTMLInputElement|planetRingAngle:HTMLInputElement|fsEnabled:HTMLInputElement|fsAmp:HTMLInputElement|fsG:HTMLInputElement|fsSigma:HTMLInputElement|fsOffset:HTMLInputElement|fsGateBehind:HTMLInputElement|atmEnabled:HTMLInputElement|atmKind:HTMLSelectElement|atmR0:HTMLInputElement|atmH:HTMLInputElement|atmTau0:HTMLInputElement|atmLambdaNm:HTMLInputElement|atmTauScale:HTMLInputElement|moonEnabled:HTMLInputElement|moonR:HTMLInputElement|moonA:HTMLInputElement|moonE:HTMLInputElement|moonInc:HTMLInputElement|moonPeriod:HTMLInputElement|moonMass:HTMLInputElement|moonPhaseEnabled:HTMLInputElement|moonReflAmp:HTMLInputElement|moonThermAmp:HTMLInputElement|moonLambertian:HTMLInputElement|moonThermalInertiaEnabled:HTMLInputElement|moonAlbedo:HTMLInputElement|moonEmissivity:HTMLInputElement|moonThermalTimescale:HTMLInputElement|moonRedistribution:HTMLInputElement|moonOblateEnabled:HTMLInputElement|moonOblateness:HTMLInputElement|moonRingsEnabled:HTMLInputElement|moonRingInner:HTMLInputElement|moonRingOuter:HTMLInputElement|moonRingInc:HTMLInputElement|moonRingAngle:HTMLInputElement|smearEnabled:HTMLInputElement|cadenceSec:HTMLInputElement|nSubsamples:HTMLInputElement|varEnabled:HTMLInputElement|beamingAmp:HTMLInputElement|ellipsoidalAmp:HTMLInputElement|beamingOffset:HTMLInputElement|ellipsoidalOffset:HTMLInputElement|varConstant:HTMLInputElement|dnEnabled:HTMLInputElement|dnClamp:HTMLInputElement|dnReflectedModel:HTMLSelectElement|dnThermalModel:HTMLSelectElement|exoEnabled:HTMLInputElement|exoTRef:HTMLInputElement|exoVelDt:HTMLInputElement|exoMoonOmegaDot:HTMLInputElement|exoMoonIncDot:HTMLInputElement|exoMoonOmegaSmallDot:HTMLInputElement|exoImpactYDot:HTMLInputElement|nbodyEnabled:HTMLInputElement|nbodyMuStar:HTMLInputElement|nbodyMuPlanet:HTMLInputElement|nbodyMuMoon:HTMLInputElement|nbodyDtMax:HTMLInputElement|nbodySoftening:HTMLInputElement|pert1Enabled:HTMLInputElement|pert1Mu:HTMLInputElement|pert1A:HTMLInputElement|pert1E:HTMLInputElement|pert1Inc:HTMLInputElement|pert1Period:HTMLInputElement|pert2Enabled:HTMLInputElement|pert2Mu:HTMLInputElement|pert2A:HTMLInputElement|pert2E:HTMLInputElement|pert2Inc:HTMLInputElement|pert2Period:HTMLInputElement|relEnabled:HTMLInputElement|relLTTE:HTMLInputElement|relShapiro:HTMLInputElement|relGR:HTMLInputElement|relC:HTMLInputElement|relPlanetPrec:HTMLInputElement|relMoonPrec:HTMLInputElement";

function optionalGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function requiredConstructorFor(name: string): RefConstructor | undefined {
  switch (name) {
    case "HTMLButtonElement":
      return HTMLButtonElement;
    case "HTMLCanvasElement":
      return HTMLCanvasElement;
    case "HTMLElement":
      return HTMLElement;
    case "HTMLInputElement":
      return HTMLInputElement;
    case "HTMLSelectElement":
      return HTMLSelectElement;
    default:
      return undefined;
  }
}

export function createUiRefs(): UiRefs {
  return Object.fromEntries(
    uiRefSpec.split("|").map((entry) => {
      const [reference, constructorName] = entry.split(":");
      const [key, id = key] = reference.split(">");
      const ctor = requiredConstructorFor(constructorName);

      return [key, ctor ? mustGetAs(id, ctor) : optionalGet(id)];
    }),
  ) as UiRefs;
}

export const uiRefs = new Proxy({} as UiRefs, {
  get(_target, prop) {
    return createUiRefs()[prop as keyof UiRefs];
  },
  has(_target, prop) {
    return prop in createUiRefs();
  },
  ownKeys() {
    return Reflect.ownKeys(createUiRefs());
  },
  getOwnPropertyDescriptor(_target, prop) {
    const refs = createUiRefs();
    return {
      configurable: true,
      enumerable: true,
      value: refs[prop as keyof UiRefs],
    };
  },
}) as UiRefs;
