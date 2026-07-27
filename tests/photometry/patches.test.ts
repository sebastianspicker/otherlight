/** Verifies patches calculations in the observable-light and transit model. */

import { describe, expect, it } from "vitest";

import type { BrightnessPatch } from "../../src/core/types";
import { patchFactorAt, sanitizeBrightnessPatches } from "../../src/photometry/patches";

describe("brightness patch factors", () => {
  const patches: BrightnessPatch[] = [
    { shape: "circle", x: 0, y: 0, r: 1, factor: 0.5 },
    { shape: "circle", x: 0, y: 0, r: 0.5, factor: 1.4 },
  ];

  it("preserves multiply, max, and override-last combine semantics", () => {
    const sanitized = sanitizeBrightnessPatches(patches);

    expect(patchFactorAt(0, 0, sanitized, "multiply")).toBeCloseTo(0.7);
    expect(patchFactorAt(0, 0, sanitized, "max")).toBeCloseTo(1.4);
    expect(patchFactorAt(0, 0, sanitized, "overrideLast")).toBeCloseTo(1.4);
    expect(patchFactorAt(0.75, 0, sanitized, "overrideLast")).toBeCloseTo(0.5);
    expect(patchFactorAt(2, 0, sanitized, "max")).toBe(1);
  });

  it("keeps invalid coordinates and invalid factors neutral after sanitization", () => {
    const sanitized = sanitizeBrightnessPatches([
      { shape: "circle", x: 0, y: 0, r: 1, factor: -2 },
      { shape: "ellipse", x: 2, y: 0, rx: 1, ry: 0.5, factor: 0.2 },
      { shape: "circle", x: Number.NaN, y: 0, r: 1, factor: 2 },
    ]);

    expect(sanitized).toHaveLength(2);
    expect(patchFactorAt(0, 0, sanitized, "multiply")).toBe(0);
    expect(patchFactorAt(Number.NaN, 0, sanitized, "multiply")).toBe(1);
  });
});
