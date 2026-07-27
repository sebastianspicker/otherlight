/** Verifies product view state controls and views for accessible, consistent interaction. */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRODUCT_VIEW_STATE,
  applyProductViewState,
  isStableProductViewId,
  parseProductViewState,
  productViewStateSearch,
  serializeProductViewState,
  type ProductViewState,
} from "../../src/ui/productViewState";

const SHAREABLE_STATE: ProductViewState = {
  profile: "scientific",
  mode: "lab",
  ui: "advanced",
  source: "real",
  scenario: "k2-3-b",
  lab: "binary-stars",
  lesson: "binary-eclipse-lab",
  runtime: "reference",
};

describe("product view state query adapter", () => {
  it("round-trips valid shareable state", () => {
    const params = serializeProductViewState(SHAREABLE_STATE);

    expect(parseProductViewState(params)).toEqual({ state: SHAREABLE_STATE, corrections: [] });
    expect(productViewStateSearch(SHAREABLE_STATE)).toContain("mode=lab");
    expect(productViewStateSearch(SHAREABLE_STATE)).toContain("profile=scientific");
  });

  it("migrates pre-catalog lab query values without changing their system", () => {
    expect(parseProductViewState(new URLSearchParams("lab=preset")).state.lab).toBe("transit-exomoon");
    expect(parseProductViewState(new URLSearchParams("lab=binary")).state.lab).toBe("binary-stars");
  });

  it("falls back safely and reports invalid known values", () => {
    const parsed = parseProductViewState(
      new URLSearchParams(
        "mode=preview&ui=expert&source=remote&scenario=%3Cscript%3E&lab=three-body&lesson=bad%20id&runtime=fast",
      ),
    );

    expect(parsed.state).toEqual(DEFAULT_PRODUCT_VIEW_STATE);
    expect(parsed.corrections).toHaveLength(7);
    expect(parsed.corrections.join(" ")).toContain("Invalid scenario ID");
    expect(parsed.corrections.join(" ")).toContain("Invalid lesson ID");
  });

  it("preserves unrelated query parameters while replacing product context", () => {
    const existing = new URLSearchParams("utm_source=newsletter&experiment=curve-v2&mode=lab");
    const serialized = serializeProductViewState(DEFAULT_PRODUCT_VIEW_STATE, existing);

    expect(serialized.get("utm_source")).toBe("newsletter");
    expect(serialized.get("experiment")).toBe("curve-v2");
    expect(serialized.get("mode")).toBe("simulation");

    expect(applyProductViewState(existing, SHAREABLE_STATE)).toBe(existing);
    expect(existing.get("utm_source")).toBe("newsletter");
    expect(existing.get("lesson")).toBe("binary-eclipse-lab");
  });

  it("accepts only bounded lowercase dash-separated scenario and lesson IDs", () => {
    expect(isStableProductViewId("kepler-geometry")).toBe(true);
    expect(isStableProductViewId("k2-3-b")).toBe(true);
    expect(isStableProductViewId("Uppercase")).toBe(false);
    expect(isStableProductViewId("lesson id")).toBe(false);
    expect(isStableProductViewId("<img-onerror>")).toBe(false);
    expect(isStableProductViewId("a".repeat(129))).toBe(false);
  });
});
