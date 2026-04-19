// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { installAppShellDocument } from "../helpers/appShell";
import { createUiRefs } from "../../src/ui/refs";
import { wireParamSliders } from "../../src/ui/sliders";

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
  });
});
