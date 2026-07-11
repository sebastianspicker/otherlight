// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  readClampSmearedFlux,
  readNumberInput,
  readPlotMode,
  readPlotTrackingMode,
  readCheckbox,
  readSelect,
  sanitizeFinite,
  sanitizePositive,
  writeNumberInput,
} from "../../src/ui/inputs";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeNumberInput(value: string): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "number";
  el.value = value;
  return el;
}

function makeCheckbox(checked: boolean): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "checkbox";
  el.checked = checked;
  return el;
}

function makeSelect(value: string): HTMLSelectElement {
  const el = document.createElement("select");
  const opt = document.createElement("option");
  opt.value = value;
  opt.selected = true;
  el.appendChild(opt);
  return el;
}

// ---------------------------------------------------------------------------
// readNumberInput
// ---------------------------------------------------------------------------

describe("readNumberInput", () => {
  it("returns the numeric value of the input element", () => {
    const el = makeNumberInput("42");
    expect(readNumberInput(el, 0)).toBe(42);
  });

  it("returns the fallback when the value is not a number", () => {
    // Use type="text" because jsdom sanitizes type="number" values,
    // converting "abc" to "" which then parses as 0 via Number("").
    const el = document.createElement("input");
    el.type = "text";
    el.value = "abc";
    expect(readNumberInput(el, 99)).toBe(99);
  });

  it("returns the fallback for an empty string value", () => {
    const el = makeNumberInput("");
    expect(readNumberInput(el, -1)).toBe(-1);
  });

  it("returns the fallback for a truly unparseable value", () => {
    const el = document.createElement("input");
    el.type = "text";
    el.value = "not-a-number";
    expect(readNumberInput(el, -1)).toBe(-1);
  });

  it("handles negative numbers", () => {
    const el = makeNumberInput("-3.5");
    expect(readNumberInput(el, 0)).toBe(-3.5);
  });

  it("handles zero", () => {
    const el = makeNumberInput("0");
    expect(readNumberInput(el, 10)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// readCheckbox
// ---------------------------------------------------------------------------

describe("readCheckbox", () => {
  it("returns true when checked", () => {
    expect(readCheckbox(makeCheckbox(true))).toBe(true);
  });

  it("returns false when not checked", () => {
    expect(readCheckbox(makeCheckbox(false))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// readSelect
// ---------------------------------------------------------------------------

describe("readSelect", () => {
  it("returns the selected value", () => {
    expect(readSelect(makeSelect("measured"), "physical")).toBe("measured");
  });

  it("returns fallback for an empty value", () => {
    expect(readSelect(makeSelect(""), "physical")).toBe("physical");
  });
});

describe("plot control readers", () => {
  it("reads plot mode from a select element", () => {
    expect(readPlotMode(makeSelect("measured"))).toBe("measured");
  });

  it("defaults plot mode to physical when missing", () => {
    expect(readPlotMode(null)).toBe("physical");
  });

  it("reads plot tracking mode from a select element", () => {
    expect(readPlotTrackingMode(makeSelect("live"))).toBe("live");
  });

  it("defaults plot tracking mode to fixed when missing", () => {
    expect(readPlotTrackingMode(null)).toBe("fixed");
  });

  it("reads clamp smeared flux from a checkbox", () => {
    expect(readClampSmearedFlux(makeCheckbox(true))).toBe(true);
  });

  it("defaults clamp smeared flux to false when missing", () => {
    expect(readClampSmearedFlux(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sanitizeFinite
// ---------------------------------------------------------------------------

describe("sanitizeFinite", () => {
  it("returns the value when it is finite", () => {
    expect(sanitizeFinite(3.14, 0)).toBe(3.14);
  });

  it("returns the fallback for NaN", () => {
    expect(sanitizeFinite(NaN, 7)).toBe(7);
  });

  it("returns the fallback for Infinity", () => {
    expect(sanitizeFinite(Infinity, 5)).toBe(5);
  });

  it("returns the fallback for -Infinity", () => {
    expect(sanitizeFinite(-Infinity, 5)).toBe(5);
  });

  it("returns zero when zero is the value", () => {
    expect(sanitizeFinite(0, 10)).toBe(0);
  });

  it("returns negative numbers correctly", () => {
    expect(sanitizeFinite(-42, 0)).toBe(-42);
  });
});

// ---------------------------------------------------------------------------
// sanitizePositive
// ---------------------------------------------------------------------------

describe("sanitizePositive", () => {
  it("clamps a value within the range", () => {
    expect(sanitizePositive(5, 1, 10)).toBe(5);
  });

  it("clamps a value below the range to the minimum", () => {
    expect(sanitizePositive(-1, 0, 100)).toBe(0);
  });

  it("clamps a value above the range to the maximum", () => {
    expect(sanitizePositive(200, 0, 100)).toBe(100);
  });

  it("returns the boundary value when the value equals the minimum", () => {
    expect(sanitizePositive(1, 1, 10)).toBe(1);
  });

  it("returns the boundary value when the value equals the maximum", () => {
    expect(sanitizePositive(10, 1, 10)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// writeNumberInput
// ---------------------------------------------------------------------------

describe("writeNumberInput", () => {
  it("sets the input value to the string representation of the number", () => {
    const el = makeNumberInput("");
    writeNumberInput(el, 3.14);
    expect(el.value).toBe("3.14");
  });

  it("sets the input value to empty string for NaN", () => {
    const el = makeNumberInput("old");
    writeNumberInput(el, NaN);
    expect(el.value).toBe("");
  });

  it("sets the input value to empty string for Infinity", () => {
    const el = makeNumberInput("old");
    writeNumberInput(el, Infinity);
    expect(el.value).toBe("");
  });

  it("writes zero correctly", () => {
    const el = makeNumberInput("old");
    writeNumberInput(el, 0);
    expect(el.value).toBe("0");
  });
});
