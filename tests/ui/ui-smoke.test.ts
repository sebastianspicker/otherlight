// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { installAppShellDocument } from "../helpers/appShell";

describe("UI smoke", () => {
  it("wires enable handlers and slider mirroring without throwing", async () => {
    installAppShellDocument();

    const { uiRefs } = await import("../../src/ui/refs");
    const { wireEnableHandlers, syncAllEnableStates } = await import("../../src/ui/enable");
    const { wireNormalModeQuickControls } = await import("../../src/ui/quickControls");
    const { wireParamSliders } = await import("../../src/ui/sliders");
    const { loadParamsIntoUI } = await import("../../src/ui/params");
    const { SCENARIO_DEFAULTS, cloneParams } = await import("../../src/app/scenario");

    // Basic wiring (should not throw).
    wireEnableHandlers(uiRefs);
    wireParamSliders(uiRefs);
    wireNormalModeQuickControls(uiRefs);

    // Load defaults into the UI, then sync enable state again.
    loadParamsIntoUI(cloneParams(SCENARIO_DEFAULTS), uiRefs);
    syncAllEnableStates(uiRefs);

    expect(document.getElementById("app")).not.toBeNull();
    expect(document.getElementById("realSystemSelect")).not.toBeNull();
    expect(document.getElementById("realSystemMeta")).not.toBeNull();
    expect(document.getElementById("productModeSelect")).not.toBeNull();
    expect(document.getElementById("simModeSelect")).not.toBeNull();
    expect(document.getElementById("uiModeSelect")).not.toBeNull();
    expect(document.getElementById("binaryLabParamNotice")).not.toBeNull();
    expect(document.getElementById("ocSection")).not.toBeNull();
    expect(document.getElementById("quickControlsRoot")).not.toBeNull();
    expect(document.getElementById("quickPlanetA")).not.toBeNull();
    expect(document.getElementById("quickMoonEnabled")).not.toBeNull();
    expect(document.getElementById("quickMoonInc")).not.toBeNull();
    expect(document.getElementById("quickReflectedLight")).not.toBeNull();
    expect(document.getElementById("timeSpeedMultiplier")).not.toBeNull();
    expect(uiRefs.plotMode?.id).toBe("plotMode");
    expect(document.getElementById("plotTrackingMode")).not.toBeNull();
    expect((document.getElementById("plotTrackingMode") as HTMLSelectElement | null)?.value).toBe("dynamic");
    expect(uiRefs.clampSmearedFlux?.id).toBe("clampSmearedFlux");
    expect(document.getElementById("smearQuantity")).toBeNull();
    expect(uiRefs.fsEnabled.disabled).toBe(false);
    expect(uiRefs.fsEnabled.checked).toBe(false);
    expect(uiRefs.fsAmp.disabled).toBe(true);
    expect(document.body.textContent).toContain("Adds a narrow pre-/post-transit brightening term");
    expect(document.getElementById("runtimeModeSelect")).not.toBeNull();
    expect(document.getElementById("didBinaryControls")).not.toBeNull();
    expect(document.getElementById("didHypothesisSelect")).not.toBeNull();
    expect(document.getElementById("didRevealSkyBtn")).not.toBeNull();
    expect(document.getElementById("didLessonSummary")).not.toBeNull();
    expect(document.getElementById("didLessonMeta")).not.toBeNull();
    expect(document.getElementById("didPhaseTitle")).not.toBeNull();
    expect(document.getElementById("didPhasePrompt")).not.toBeNull();
    expect(document.getElementById("didInterpretation")).not.toBeNull();
    expect(document.getElementById("didWorkedExample")).not.toBeNull();
    expect(document.getElementById("didObservationList")).not.toBeNull();
    expect(document.getElementById("didResponseComposer")).not.toBeNull();
    expect(document.getElementById("didPrimaryResponseInput")).not.toBeNull();
    expect(document.getElementById("didSecondaryResponseInput")).not.toBeNull();
    expect(document.getElementById("didResponseHelp")).not.toBeNull();
    expect(document.getElementById("didPrevBtn")).not.toBeNull();
    expect(document.getElementById("didHintLevelSelect")).not.toBeNull();
    expect(document.getElementById("didHintLessBtn")).not.toBeNull();
    expect(document.getElementById("didHintMoreBtn")).not.toBeNull();
    expect(document.getElementById("didEventTargetSelect")).not.toBeNull();
    expect(document.getElementById("didJumpEventBtn")).not.toBeNull();
    expect(document.getElementById("didFocusList")).not.toBeNull();
    expect(document.getElementById("didHintList")).not.toBeNull();
    expect(document.getElementById("didMisconceptionList")).not.toBeNull();
    expect(document.getElementById("timingHistoryVal")).not.toBeNull();
    expect(document.getElementById("ocCanvas")).not.toBeNull();
    expect(document.getElementById("ocBodySelect")).not.toBeNull();
    expect(document.getElementById("ocUnitSelect")).not.toBeNull();
    expect(document.getElementById("ocTrendModeSelect")).not.toBeNull();
    expect(document.getElementById("ocExportBtn")).not.toBeNull();
    expect(document.getElementById("ocClearBtn")).not.toBeNull();
    expect(document.getElementById("ocFitVal")).not.toBeNull();
  });
});
