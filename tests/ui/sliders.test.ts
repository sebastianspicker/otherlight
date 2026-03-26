// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { wireParamSliders } from "../../src/ui/sliders";
import type { UiRefs } from "../../src/ui/refs";

// ---------------------------------------------------------------------------
// wireParamSliders — DOM-wiring side-effect module
// ---------------------------------------------------------------------------

describe("wireParamSliders", () => {
  it("is a callable function", () => {
    expect(typeof wireParamSliders).toBe("function");
  });

  it("returns early without throwing when sliderRootEl is null", () => {
    const refs = { sliderRootEl: null } as unknown as UiRefs;
    expect(() => wireParamSliders(refs)).not.toThrow();
  });

  it("creates range sliders for number inputs with min/max attributes", () => {
    // Build a minimal DOM matching the expected structure.
    const form = document.createElement("form");
    form.id = "paramForm";
    document.body.appendChild(form);

    const numInput = document.createElement("input");
    numInput.type = "number";
    numInput.id = "testParam";
    numInput.setAttribute("min", "0");
    numInput.setAttribute("max", "100");
    numInput.setAttribute("step", "1");
    numInput.value = "50";
    form.appendChild(numInput);

    const sliderRoot = document.createElement("div");
    sliderRoot.id = "sliderRoot";
    document.body.appendChild(sliderRoot);

    const refs = {
      sliderRootEl: sliderRoot,
      overrideModeEl: null,
    } as unknown as UiRefs;

    wireParamSliders(refs);

    // A slider row should have been created.
    const ranges = sliderRoot.querySelectorAll("input[type='range']");
    expect(ranges.length).toBe(1);

    const range = ranges[0] as HTMLInputElement;
    expect(range.id).toBe("slider-testParam");
    expect(range.min).toBe("0");
    expect(range.max).toBe("100");
    expect(range.value).toBe("50");

    // Cleanup.
    document.body.removeChild(form);
    document.body.removeChild(sliderRoot);
  });

  it("synchronizes slider input to number input", () => {
    const form = document.createElement("form");
    form.id = "paramForm";
    document.body.appendChild(form);

    const numInput = document.createElement("input");
    numInput.type = "number";
    numInput.id = "syncParam";
    numInput.setAttribute("min", "0");
    numInput.setAttribute("max", "10");
    numInput.value = "5";
    form.appendChild(numInput);

    const sliderRoot = document.createElement("div");
    document.body.appendChild(sliderRoot);

    const refs = {
      sliderRootEl: sliderRoot,
      overrideModeEl: null,
    } as unknown as UiRefs;

    wireParamSliders(refs);

    const range = sliderRoot.querySelector("input[type='range']") as HTMLInputElement;
    expect(range).not.toBeNull();

    // Simulate slider change.
    range.value = "7";
    range.dispatchEvent(new Event("input", { bubbles: true }));

    // The number input should mirror the slider value.
    expect(numInput.value).toBe("7");

    // Cleanup.
    document.body.removeChild(form);
    document.body.removeChild(sliderRoot);
  });

  it("synchronizes number input to slider (reverse direction)", () => {
    const form = document.createElement("form");
    form.id = "paramForm";
    document.body.appendChild(form);

    const numInput = document.createElement("input");
    numInput.type = "number";
    numInput.id = "revParam";
    numInput.setAttribute("min", "0");
    numInput.setAttribute("max", "10");
    numInput.value = "5";
    form.appendChild(numInput);

    const sliderRoot = document.createElement("div");
    document.body.appendChild(sliderRoot);

    const refs = {
      sliderRootEl: sliderRoot,
      overrideModeEl: null,
    } as unknown as UiRefs;

    wireParamSliders(refs);

    const range = sliderRoot.querySelector("input[type='range']") as HTMLInputElement;

    // Update number input and fire its input event.
    numInput.value = "3";
    numInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Slider should be clamped to the value.
    expect(range.value).toBe("3");

    // Cleanup.
    document.body.removeChild(form);
    document.body.removeChild(sliderRoot);
  });

  it("skips number inputs without both min and max attributes", () => {
    const form = document.createElement("form");
    form.id = "paramForm";
    document.body.appendChild(form);

    const numInput = document.createElement("input");
    numInput.type = "number";
    numInput.id = "noMinMax";
    numInput.value = "5";
    form.appendChild(numInput);

    const sliderRoot = document.createElement("div");
    document.body.appendChild(sliderRoot);

    const refs = {
      sliderRootEl: sliderRoot,
      overrideModeEl: null,
    } as unknown as UiRefs;

    wireParamSliders(refs);

    const ranges = sliderRoot.querySelectorAll("input[type='range']");
    expect(ranges.length).toBe(0);

    // Cleanup.
    document.body.removeChild(form);
    document.body.removeChild(sliderRoot);
  });
});
