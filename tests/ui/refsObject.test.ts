// @vitest-environment jsdom
/** Verifies the UI reference object preserves required, optional, and proxy contracts. */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UiRefs } from "../../src/ui/refs";
import { createUiRefs, uiRefs } from "../../src/ui/refsObject";
import { installAppShellDocument } from "../helpers/appShell";

const requiredConstructorNames = [
  "HTMLButtonElement",
  "HTMLCanvasElement",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
] as const;

type RequiredConstructorName = (typeof requiredConstructorNames)[number];
type ConstructorName = RequiredConstructorName | "optional";
type RefContract = {
  key: keyof UiRefs;
  id: string;
  constructorName: ConstructorName;
};

const refContract: RefContract[] =
  "skyCanvas:HTMLCanvasElement|lcCanvas:HTMLCanvasElement|btnStart:HTMLButtonElement|btnReset:HTMLButtonElement|btnClearLC:HTMLButtonElement|viewZoomEnabled:optional|btnZoomOut:optional|btnZoomIn:optional|btnZoomReset:optional|zoomVal:optional|timeSpeed:HTMLInputElement|timeSpeedMultiplier:HTMLSelectElement|timeSpeedVal:HTMLElement|plotMode:optional|plotTrackingMode:optional|clampSmearedFlux:optional|viewAutoFit:optional|tVal:HTMLElement|fluxVal:HTMLElement|productProfileSelect:HTMLSelectElement|productModeSelect:HTMLSelectElement|uiModeSelect:HTMLSelectElement|simModeSelect:optional|runtimeModeSelect:optional|presetSelect:HTMLSelectElement|presetDesc:HTMLElement|realSystemSelect:optional|realSystemMeta:optional|skyBlackboxHint:optional|plotModeVal:optional|warnVal:optional|nOccultersVal:optional|vPlanetVal:optional|vMoonVal:optional|timingHistoryVal:optional|didLessonStatus:optional|didLessonSummary:optional|didLessonMeta:optional|didPhaseTitle:optional|didPhasePrompt:optional|didInterpretation:optional|didWorkedExample:optional|didObservationList:optional|didResponseComposer:optional|didPrimaryResponseLabel:optional|didPrimaryResponseInput:optional|didSecondaryResponseLabel:optional|didSecondaryResponseInput:optional|didResponseHelp:optional|didFocusList:optional|didHintList:optional|didMisconceptionList:optional|didCheckList:optional|didFormulaList:optional|didCompareOut:optional|ocCanvas:optional|ocBodySelect:optional|ocUnitSelect:optional|ocTrendModeSelect:optional|ocExportBtn:optional|ocClearBtn:optional|ocStatsVal:optional|ocFitVal:optional|didLessonSelect:optional|didPrevBtn:optional|didHintLevelSelect:optional|didHintLessBtn:optional|didHintMoreBtn:optional|didEventTargetSelect:optional|didJumpEventBtn:optional|didAutoAssess:optional|didCheckBtn:optional|didNextBtn:optional|didExportBtn:optional|didComparePreset:optional|didCompareTime:optional|didCompareBtn:optional|didHypothesisSelect:optional|didRevealSkyBtn:optional|didBinaryControls:optional|btnApplyParams:HTMLButtonElement|btnResetParams:HTMLButtonElement|overrideModeEl>overrideMode:optional|sliderRootEl>sliderRoot:optional|quickControlsRootEl>quickControlsRoot:optional|quickPlanetR:HTMLInputElement|quickPlanetRVal:HTMLElement|quickPlanetInc:HTMLInputElement|quickPlanetIncVal:HTMLElement|quickPlanetA:HTMLInputElement|quickPlanetAVal:HTMLElement|quickMoonEnabled:HTMLInputElement|quickMoonR:HTMLInputElement|quickMoonRVal:HTMLElement|quickMoonA:HTMLInputElement|quickMoonAVal:HTMLElement|quickMoonInc:HTMLInputElement|quickMoonIncVal:HTMLElement|quickReflectedLight:HTMLInputElement|observerX:HTMLInputElement|observerY:HTMLInputElement|observerZ:HTMLInputElement|starR:HTMLInputElement|baselineFlux:HTMLInputElement|gridRes:HTMLInputElement|ldEnabled:HTMLInputElement|ldU1:HTMLInputElement|ldU2:HTMLInputElement|ldBandpass:HTMLInputElement|ldBands:HTMLInputElement|patchesEnabled:HTMLInputElement|spotEvolutionEnabled:HTMLInputElement|spotRotationPeriod:HTMLInputElement|spotCoverage:HTMLInputElement|spotLifetime:HTMLInputElement|spotDriftRate:HTMLInputElement|p1x:HTMLInputElement|p1y:HTMLInputElement|p1r:HTMLInputElement|p1f:HTMLInputElement|p2x:HTMLInputElement|p2y:HTMLInputElement|p2rx:HTMLInputElement|p2ry:HTMLInputElement|p2angle:HTMLInputElement|p2f:HTMLInputElement|planetR:HTMLInputElement|planetA:HTMLInputElement|planetE:HTMLInputElement|planetInc:HTMLInputElement|planetPeriod:HTMLInputElement|planetMass:HTMLInputElement|planetPhaseEnabled:HTMLInputElement|planetReflAmp:HTMLInputElement|planetThermAmp:HTMLInputElement|planetReflOffset:HTMLInputElement|planetThermOffset:HTMLInputElement|planetLambertian:HTMLInputElement|planetConstant:HTMLInputElement|planetThermalInertiaEnabled:HTMLInputElement|planetAlbedo:HTMLInputElement|planetEmissivity:HTMLInputElement|planetThermalTimescale:HTMLInputElement|planetRedistribution:HTMLInputElement|planetOblateEnabled:HTMLInputElement|planetOblateness:HTMLInputElement|planetRingsEnabled:HTMLInputElement|planetRingInner:HTMLInputElement|planetRingOuter:HTMLInputElement|planetRingInc:HTMLInputElement|planetRingAngle:HTMLInputElement|fsEnabled:HTMLInputElement|fsAmp:HTMLInputElement|fsG:HTMLInputElement|fsSigma:HTMLInputElement|fsOffset:HTMLInputElement|fsGateBehind:HTMLInputElement|atmEnabled:HTMLInputElement|atmKind:HTMLSelectElement|atmR0:HTMLInputElement|atmH:HTMLInputElement|atmTau0:HTMLInputElement|atmLambdaNm:HTMLInputElement|atmTauScale:HTMLInputElement|moonEnabled:HTMLInputElement|moonR:HTMLInputElement|moonA:HTMLInputElement|moonE:HTMLInputElement|moonInc:HTMLInputElement|moonPeriod:HTMLInputElement|moonMass:HTMLInputElement|moonPhaseEnabled:HTMLInputElement|moonReflAmp:HTMLInputElement|moonThermAmp:HTMLInputElement|moonLambertian:HTMLInputElement|moonThermalInertiaEnabled:HTMLInputElement|moonAlbedo:HTMLInputElement|moonEmissivity:HTMLInputElement|moonThermalTimescale:HTMLInputElement|moonRedistribution:HTMLInputElement|moonOblateEnabled:HTMLInputElement|moonOblateness:HTMLInputElement|moonRingsEnabled:HTMLInputElement|moonRingInner:HTMLInputElement|moonRingOuter:HTMLInputElement|moonRingInc:HTMLInputElement|moonRingAngle:HTMLInputElement|smearEnabled:HTMLInputElement|cadenceSec:HTMLInputElement|nSubsamples:HTMLInputElement|varEnabled:HTMLInputElement|beamingAmp:HTMLInputElement|ellipsoidalAmp:HTMLInputElement|beamingOffset:HTMLInputElement|ellipsoidalOffset:HTMLInputElement|varConstant:HTMLInputElement|dnEnabled:HTMLInputElement|dnClamp:HTMLInputElement|dnReflectedModel:HTMLSelectElement|dnThermalModel:HTMLSelectElement|exoEnabled:HTMLInputElement|exoTRef:HTMLInputElement|exoVelDt:HTMLInputElement|exoMoonOmegaDot:HTMLInputElement|exoMoonIncDot:HTMLInputElement|exoMoonOmegaSmallDot:HTMLInputElement|exoImpactYDot:HTMLInputElement|nbodyEnabled:HTMLInputElement|nbodyMuStar:HTMLInputElement|nbodyMuPlanet:HTMLInputElement|nbodyMuMoon:HTMLInputElement|nbodyDtMax:HTMLInputElement|nbodySoftening:HTMLInputElement|pert1Enabled:HTMLInputElement|pert1Mu:HTMLInputElement|pert1A:HTMLInputElement|pert1E:HTMLInputElement|pert1Inc:HTMLInputElement|pert1Period:HTMLInputElement|pert2Enabled:HTMLInputElement|pert2Mu:HTMLInputElement|pert2A:HTMLInputElement|pert2E:HTMLInputElement|pert2Inc:HTMLInputElement|pert2Period:HTMLInputElement|relEnabled:HTMLInputElement|relLTTE:HTMLInputElement|relShapiro:HTMLInputElement|relGR:HTMLInputElement|relC:HTMLInputElement|relPlanetPrec:HTMLInputElement|relMoonPrec:HTMLInputElement"
    .split("|")
    .map((entry) => {
      const [reference, constructorName] = entry.split(":") as [string, ConstructorName];
      const [key, id = key] = reference.split(">");

      return { key: key as keyof UiRefs, id, constructorName };
    });

function constructorFor(name: RequiredConstructorName): new () => HTMLElement {
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
  }
}

function incompatibleElementFor(name: RequiredConstructorName): Element {
  return name === "HTMLElement"
    ? document.createElementNS("http://www.w3.org/2000/svg", "svg")
    : document.createElement("div");
}

describe("UI refs object", () => {
  beforeEach(() => {
    installAppShellDocument();
  });

  it("matches the complete key, DOM id, constructor, and lookup-order contract", () => {
    const refs = createUiRefs();

    expect(refContract).toHaveLength(232);
    expect(Object.keys(refs)).toEqual(refContract.map(({ key }) => key));

    for (const { key, id, constructorName } of refContract) {
      const element = document.getElementById(id);
      expect(refs[key]).toBe(element);

      if (constructorName !== "optional") {
        expect(element).toBeInstanceOf(constructorFor(constructorName));
      }
    }
  });

  it("retains mustGetAs failures for every required contract entry", () => {
    for (const { id, constructorName } of refContract) {
      if (constructorName === "optional") continue;

      const original = document.getElementById(id);
      expect(original).not.toBeNull();
      const replacement = incompatibleElementFor(constructorName);
      replacement.id = id;
      original?.replaceWith(replacement);

      try {
        expect(() => createUiRefs()).toThrow(
          `Element #${id} has wrong type: expected ${constructorName}, got`,
        );
      } finally {
        if (original) replacement.replaceWith(original);
      }
    }
  });

  it("keeps optional controls nullable and required controls missing failures", () => {
    document.getElementById("plotMode")?.remove();
    document.getElementById("didPrimaryResponseInput")?.remove();

    expect(createUiRefs().plotMode).toBeNull();

    document.getElementById("btnStart")?.remove();
    expect(() => createUiRefs()).toThrow(/Missing element #btnStart/);
  });

  it("defers DOM-constructor access until createUiRefs runs", async () => {
    vi.resetModules();
    for (const name of requiredConstructorNames) vi.stubGlobal(name, undefined);

    try {
      await expect(import("../../src/ui/refsObject")).resolves.toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("resolves constructors in the original lookup order and fails first at skyCanvas", () => {
    const originalDescriptors = new Map(
      requiredConstructorNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
    );
    const constructors = Object.fromEntries(
      requiredConstructorNames.map((name) => [name, (globalThis as Record<string, unknown>)[name]]),
    );
    const accessed: string[] = [];

    try {
      for (const name of requiredConstructorNames) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          get: () => {
            accessed.push(name);
            return constructors[name];
          },
        });
      }

      createUiRefs();

      expect(accessed).toEqual(
        refContract
          .filter(({ constructorName }) => constructorName !== "optional")
          .map(({ constructorName }) => constructorName),
      );
    } finally {
      for (const name of requiredConstructorNames) {
        const descriptor = originalDescriptors.get(name);
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    }

    installAppShellDocument();
    const canvasDescriptor = Object.getOwnPropertyDescriptor(globalThis, "HTMLCanvasElement");
    Object.defineProperty(globalThis, "HTMLCanvasElement", {
      configurable: true,
      get: () => {
        throw new ReferenceError("HTMLCanvasElement is not defined");
      },
    });

    try {
      expect(() => createUiRefs()).toThrow(/HTMLCanvasElement is not defined/);
    } finally {
      if (canvasDescriptor) Object.defineProperty(globalThis, "HTMLCanvasElement", canvasDescriptor);
      else Reflect.deleteProperty(globalThis, "HTMLCanvasElement");
    }
  });

  it("resolves all proxy traps against the current document", () => {
    const expectedKeys = refContract.map(({ key }) => key);
    const descriptors = Object.getOwnPropertyDescriptors(uiRefs);

    expect(Object.keys(uiRefs)).toEqual(expectedKeys);
    expect(Object.keys(descriptors)).toEqual(expectedKeys);
    expect("notAUiRef" in uiRefs).toBe(false);

    for (const { key, id } of refContract) {
      const element = document.getElementById(id);
      expect(key in uiRefs).toBe(true);
      expect(uiRefs[key]).toBe(element);
      expect(descriptors[key]).toMatchObject({
        configurable: true,
        enumerable: true,
        value: element,
      });
    }

    const initial = uiRefs.btnStart;
    const replacement = document.createElement("button");
    replacement.id = "btnStart";
    document.getElementById("btnStart")?.replaceWith(replacement);

    expect(uiRefs.btnStart).toBe(replacement);
    expect(uiRefs.btnStart).not.toBe(initial);
    expect(Object.getOwnPropertyDescriptor(uiRefs, "btnStart")?.value).toBe(replacement);
  });
});
