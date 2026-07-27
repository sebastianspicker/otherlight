// @vitest-environment jsdom
/** Verifies quick-control behavior and accessible synchronization with detailed inputs. */

import { beforeEach, expect, it, vi } from "vitest";
import { installAppShellDocument } from "../helpers/appShell";

function installDom(): void {
  installAppShellDocument();
}

beforeEach(() => {
  installDom();
});

it("shows the curated quick panel in normal mode and hides the raw parameter grid", async () => {
  const { syncUiModeVisibility } = await import("../../src/ui/mode");

  syncUiModeVisibility("normal");
  expect((document.getElementById("quickControlsFieldset") as HTMLElement).hidden).toBe(false);
  expect((document.querySelector(".paramCols") as HTMLElement).hidden).toBe(true);
  const bodyText = document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
  expect(bodyText).toContain("Planet inclination");
  expect(bodyText).toContain("Moon inclination");
  expect(bodyText).toContain("These sliders update the model and figures directly.");

  syncUiModeVisibility("expert");
  expect((document.getElementById("quickControlsFieldset") as HTMLElement).hidden).toBe(false);
  expect((document.querySelector(".paramCols") as HTMLElement).hidden).toBe(false);
  expect((document.querySelector(".advanced-parameter-drawer") as HTMLDetailsElement).open).toBe(true);
});

it("keeps orbit period consistent when a normal-mode orbit-size slider changes semi-major axis", async () => {
  const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");
  const { muFromPeriodAndA } = await import("../../src/physics/kepler");
  const { loadParamsIntoUI } = await import("../../src/ui/params");
  const { uiRefs } = await import("../../src/ui/refs");
  const { wireNormalModeQuickControls } = await import("../../src/ui/quickControls");

  loadParamsIntoUI(cloneParams(SCENARIO_DEFAULTS), uiRefs);
  wireNormalModeQuickControls(uiRefs);

  const muBefore = muFromPeriodAndA(Number(uiRefs.planetPeriod.value), Number(uiRefs.planetA.value));
  const nextA = Number(uiRefs.planetA.value) * 1.25;

  uiRefs.quickPlanetA.value = String(nextA);
  uiRefs.quickPlanetA.dispatchEvent(new Event("input", { bubbles: true }));

  const muAfter = muFromPeriodAndA(Number(uiRefs.planetPeriod.value), Number(uiRefs.planetA.value));
  expect(Number(uiRefs.planetA.value)).toBeCloseTo(nextA, 6);
  expect(muAfter).toBeCloseTo(muBefore, 6);
});

it("syncs moon and reflected-light quick toggles back into the underlying inputs", async () => {
  const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");
  const { wireEnableHandlers } = await import("../../src/ui/enable");
  const { loadParamsIntoUI } = await import("../../src/ui/params");
  const { uiRefs } = await import("../../src/ui/refs");
  const { wireNormalModeQuickControls } = await import("../../src/ui/quickControls");

  loadParamsIntoUI(cloneParams(SCENARIO_DEFAULTS), uiRefs);
  wireEnableHandlers(uiRefs);
  wireNormalModeQuickControls(uiRefs);

  uiRefs.quickMoonEnabled.checked = false;
  uiRefs.quickMoonEnabled.dispatchEvent(new Event("change", { bubbles: true }));

  expect(uiRefs.moonEnabled.checked).toBe(false);
  expect(uiRefs.quickMoonR.disabled).toBe(true);
  expect(uiRefs.quickMoonA.disabled).toBe(true);
  expect(uiRefs.quickMoonInc.disabled).toBe(true);

  uiRefs.quickReflectedLight.checked = false;
  uiRefs.quickReflectedLight.dispatchEvent(new Event("change", { bubbles: true }));

  expect(uiRefs.planetPhaseEnabled.checked).toBe(false);
  expect(uiRefs.moonPhaseEnabled.checked).toBe(false);
  expect(uiRefs.dnEnabled.checked).toBe(false);
});

it("syncs moon inclination through the teaching slider", async () => {
  const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");
  const { loadParamsIntoUI } = await import("../../src/ui/params");
  const { uiRefs } = await import("../../src/ui/refs");
  const { wireNormalModeQuickControls } = await import("../../src/ui/quickControls");

  loadParamsIntoUI(cloneParams(SCENARIO_DEFAULTS), uiRefs);
  wireNormalModeQuickControls(uiRefs);

  uiRefs.quickMoonInc.value = "7.5";
  uiRefs.quickMoonInc.dispatchEvent(new Event("input", { bubbles: true }));

  expect(Number(uiRefs.moonInc.value)).toBeCloseTo(7.5, 6);
  expect(uiRefs.quickMoonIncVal.textContent).toContain("7.5");
});

it("invokes the quick-change callback for teaching interactions", async () => {
  const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");
  const { loadParamsIntoUI } = await import("../../src/ui/params");
  const { uiRefs } = await import("../../src/ui/refs");
  const { wireNormalModeQuickControls } = await import("../../src/ui/quickControls");

  const onQuickControlChange = vi.fn();

  loadParamsIntoUI(cloneParams(SCENARIO_DEFAULTS), uiRefs);
  wireNormalModeQuickControls(uiRefs, { onQuickControlChange });

  uiRefs.quickPlanetR.value = String(Number(uiRefs.quickPlanetR.value) * 1.1);
  uiRefs.quickPlanetR.dispatchEvent(new Event("input", { bubbles: true }));
  uiRefs.quickMoonInc.value = "4";
  uiRefs.quickMoonInc.dispatchEvent(new Event("input", { bubbles: true }));

  expect(onQuickControlChange).toHaveBeenCalledTimes(2);
});
