// @vitest-environment jsdom
/** Verifies enable controls and views for accessible, consistent interaction. */

import { describe, expect, it } from "vitest";
import { installAppShellDocument } from "../helpers/appShell";

describe("enable handler wiring", () => {
  it("re-syncs dependent moon controls when the checkbox changes", async () => {
    installAppShellDocument();

    const { uiRefs } = await import("../../src/ui/refs");
    const { wireEnableHandlers } = await import("../../src/ui/enable");

    uiRefs.moonEnabled.checked = false;
    wireEnableHandlers(uiRefs);
    expect(uiRefs.moonR.disabled).toBe(true);

    uiRefs.moonEnabled.checked = true;
    uiRefs.moonEnabled.dispatchEvent(new Event("change", { bubbles: true }));

    expect(uiRefs.moonR.disabled).toBe(false);
    expect(uiRefs.moonA.disabled).toBe(false);
    expect(uiRefs.moonPhaseEnabled.disabled).toBe(false);
  });

  it("enables forward-scattering controls only when the feature is checked", async () => {
    installAppShellDocument();

    const { uiRefs } = await import("../../src/ui/refs");
    const { wireEnableHandlers, syncAllEnableStates } = await import("../../src/ui/enable");

    wireEnableHandlers(uiRefs);
    syncAllEnableStates(uiRefs);
    expect(uiRefs.fsAmp.disabled).toBe(true);

    uiRefs.fsEnabled.checked = true;
    uiRefs.fsEnabled.dispatchEvent(new Event("change", { bubbles: true }));

    expect(uiRefs.fsAmp.disabled).toBe(false);
    expect(uiRefs.fsG.disabled).toBe(false);
    expect(uiRefs.fsSigma.disabled).toBe(false);
  });
});
