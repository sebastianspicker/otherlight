// @vitest-environment jsdom
/** Verifies normal-mode numeric ranges sourced from the bundled scenario metadata. */

import { beforeEach, expect, it } from "vitest";
import { applyScenarioNormalRanges, scenarioNormalRange } from "../../src/ui/scenarioControlRanges";

beforeEach(() => {
  document.body.innerHTML = "";
});

it("returns the validated bundled range for a known numeric control", () => {
  expect(scenarioNormalRange("planetA")).toEqual({ min: 1e8, max: 1e12, step: 1e7 });
  expect(scenarioNormalRange("unknownControl")).toBeUndefined();
});

it("applies bundled ranges only to matching numeric inputs", () => {
  document.body.innerHTML = `
    <form id="parameters">
      <input id="planetInc" type="number" min="0" max="1" step="1" />
      <input id="unknownControl" type="number" min="2" max="3" step="0.5" />
      <input id="planetA" type="text" />
    </form>
  `;

  const form = document.getElementById("parameters");
  if (!form) throw new Error("Expected parameters form");
  applyScenarioNormalRanges(form);

  const planetInc = document.getElementById("planetInc") as HTMLInputElement;
  expect({ min: planetInc.min, max: planetInc.max, step: planetInc.step }).toEqual({
    min: "80",
    max: "100",
    step: "0.01",
  });

  const unknown = document.getElementById("unknownControl") as HTMLInputElement;
  expect({ min: unknown.min, max: unknown.max, step: unknown.step }).toEqual({
    min: "2",
    max: "3",
    step: "0.5",
  });
  expect((document.getElementById("planetA") as HTMLInputElement).min).toBe("");
});
