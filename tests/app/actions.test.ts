// @vitest-environment jsdom
/** Verifies actions contracts across app startup, controls, and runtime integration. */

import { describe, expect, it } from "vitest";

import { readTimeSpeed } from "../../src/app/actions";

describe("readTimeSpeed", () => {
  it("returns the base slider value when no multiplier select is provided", () => {
    const speed = document.createElement("input");
    speed.type = "range";
    speed.min = "0";
    speed.max = "2500";
    speed.value = "800";
    const readout = document.createElement("span");

    expect(readTimeSpeed(speed, readout)).toBe(800);
    expect(readout.textContent).toBe("800");
  });

  it("applies the selected multiplier and updates the readout", () => {
    const speed = document.createElement("input");
    speed.type = "range";
    speed.min = "0";
    speed.max = "2500";
    speed.value = "800";
    const readout = document.createElement("span");
    const multiplier = document.createElement("select");
    multiplier.innerHTML = `
      <option value="1">1x</option>
      <option value="4" selected>4x</option>
    `;
    multiplier.value = "4";

    expect(readTimeSpeed(speed, readout, multiplier)).toBe(3200);
    expect(readout.textContent).toBe("3200");
  });
});
