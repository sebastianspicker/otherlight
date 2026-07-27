// @vitest-environment jsdom
/** Verifies sliders controls and views for accessible, consistent interaction. */

import { describe, expect, it } from "vitest";
import { installAppShellDocument } from "../helpers/appShell";
import { createUiRefs } from "../../src/ui/refs";
import { wireParamSliders } from "../../src/ui/sliders";
import scenarioJson from "../../src/config/scenario.default.json";

describe("wireParamSliders", () => {
  it("rebuilds slider rows instead of appending duplicates", () => {
    installAppShellDocument();

    const refs = createUiRefs();
    wireParamSliders(refs);

    const sliderRoot = refs.sliderRootEl;
    const initialCount = sliderRoot?.querySelectorAll("input[type='range']").length ?? 0;

    wireParamSliders(refs);

    expect(initialCount).toBeGreaterThan(0);
    expect(sliderRoot?.querySelectorAll("input[type='range']").length).toBe(initialCount);
    expect(document.querySelectorAll("#slider-planetR")).toHaveLength(1);
    expect(sliderRoot?.hasAttribute("style")).toBe(false);
  });

  it("uses scenario metadata for every matching normal-mode numeric control", () => {
    installAppShellDocument();

    const refs = createUiRefs();
    wireParamSliders(refs);

    for (const control of scenarioJson.ui.controls) {
      const input = document.getElementById(control.id);
      if (!(input instanceof HTMLInputElement) || input.type !== "number") {
        throw new Error(`Scenario slider ${control.id} has no matching numeric input.`);
      }

      const slider = document.getElementById(`slider-${control.id}`);
      if (!(slider instanceof HTMLInputElement) || slider.type !== "range") {
        throw new Error(`Scenario slider ${control.id} was not wired.`);
      }
      expect(input.min).toBe(String(control.ui.min));
      expect(input.max).toBe(String(control.ui.max));
      expect(input.step).toBe(String(control.ui.step));
      expect(slider.min).toBe(String(control.ui.min));
      expect(slider.max).toBe(String(control.ui.max));
      expect(slider.step).toBe(String(control.ui.step));
    }
  });
});
