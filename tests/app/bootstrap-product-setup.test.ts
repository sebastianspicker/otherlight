// @vitest-environment jsdom
/** Verifies bootstrap product setup contracts across app startup, controls, and runtime integration. */

import { expect, it } from "vitest";

import {
  applyProductLessonSelection,
  applyProductViewControlState,
} from "../../src/app/bootstrapProductSetup";
import { parseProductViewState } from "../../src/ui/productViewState";

function selectWithOptions(values: string[]): HTMLSelectElement {
  const select = document.createElement("select");
  for (const value of values) select.add(new Option(value, value));
  return select;
}

it("repairs unknown catalog IDs while applying restored product state", () => {
  const parsed = parseProductViewState(
    new URLSearchParams(
      "profile=education&mode=simulation&ui=essential&source=preset&scenario=unknown-scenario&lab=transit-exomoon&lesson=unknown-lesson&runtime=interactive",
    ),
  );
  const presetSelect = selectWithOptions(["default", "hot-jupiter"]);
  presetSelect.value = "hot-jupiter";
  const lessonSelect = selectWithOptions(["transit-basics", "exomoon-timing"]);

  applyProductViewControlState(
    {
      productProfileSelect: selectWithOptions(["education", "scientific"]),
      productModeSelect: selectWithOptions(["simulation", "lab"]),
      uiModeSelect: selectWithOptions(["normal", "expert"]),
      simModeSelect: selectWithOptions(["preset-lab", "binary-lab"]),
      runtimeModeSelect: selectWithOptions(["realtime", "reference"]),
      presetSelect,
      presetDesc: document.createElement("p"),
      realSystemSelect: selectWithOptions(["", "kepler-16b"]),
      realSystemMeta: document.createElement("p"),
    },
    parsed,
  );
  expect(applyProductLessonSelection(lessonSelect, parsed.state.lesson, parsed.corrections)).toBe(true);

  expect(presetSelect.value).toBe("default");
  expect(lessonSelect.value).toBe("transit-basics");
  expect(parsed.corrections).toEqual([
    expect.stringContaining("Unknown preset scenario"),
    expect.stringContaining("Unknown lesson"),
  ]);
});
