/** Pins the Plate & Figure canvas colour roles for the light figure, dark figure, and sky plate. */
import { afterEach, describe, expect, it } from "vitest";

import { PLATE_INK, figureInk, inkFor, setFigureTheme } from "../../src/presentation/render/canvas/figureInk";

afterEach(() => setFigureTheme("light"));

describe("figure ink", () => {
  it("draws the light figure in ink on paper with blue-pencil B", () => {
    setFigureTheme("light");
    const ink = figureInk();
    expect(ink.paper).toBe("#f3efe6");
    expect(inkFor("#9ddcff", "figure")).toBe(ink.traceA);
    expect(inkFor("#f3cf87", "figure")).toBe(ink.traceB);
  });

  it("darkens pastel semantic colours so they stay legible on paper", () => {
    setFigureTheme("light");
    const ink = figureInk();
    expect(inkFor("#ffd166", "figure")).toBe(ink.caution);
    expect(inkFor("rgba(239, 71, 111, 1)", "figure")).toBe(ink.fault);
    expect(inkFor("#adb5bd", "figure")).toBe(ink.ink3);
  });

  it("swaps paper and ink for the dark figure and keeps other colours as authored", () => {
    setFigureTheme("dark");
    const ink = figureInk();
    expect(ink.paper).toBe("#131416");
    expect(inkFor("#9ddcff", "figure")).toBe(ink.traceA);
    expect(inkFor("#ffd166", "figure")).toBe("#ffd166");
  });

  it("keeps the sky plate identical in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      setFigureTheme(theme);
      expect(inkFor("#9ddcff", "plate")).toBe(PLATE_INK.traceA);
      expect(inkFor("#f3cf87", "plate")).toBe(PLATE_INK.traceB);
      expect(inkFor("#8ecae6", "plate")).toBe("#8ecae6");
    }
  });
});
