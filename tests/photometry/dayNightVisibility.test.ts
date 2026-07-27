/** Verifies day night visibility calculations in the observable-light and transit model. */

import { describe, expect, it } from "vitest";

import {
  applyPhaseOffset,
  phaseAngleRadFromBodyPos,
  reflectedLightGeometricWeight,
  thermalLightGeometricWeight,
  transitCenteredPhaseRadFromBodyPos,
} from "../../src/photometry/dayNightVisibility";

describe("day/night visibility geometry", () => {
  const observerDir = { x: 0, y: 0, z: 1 };

  it("maps canonical observer geometry to full and new phase", () => {
    expect(phaseAngleRadFromBodyPos({ x: 0, y: 0, z: -10 }, observerDir)).toBeCloseTo(0, 12);
    expect(phaseAngleRadFromBodyPos({ x: 0, y: 0, z: 10 }, observerDir)).toBeCloseTo(Math.PI, 12);
    expect(transitCenteredPhaseRadFromBodyPos({ x: 0, y: 0, z: 10 }, observerDir)).toBeCloseTo(0, 12);
  });

  it("keeps reflected and thermal weights bounded", () => {
    expect(reflectedLightGeometricWeight(0, "lambert")).toBeCloseTo(1, 12);
    expect(reflectedLightGeometricWeight(Math.PI, "cosine")).toBeCloseTo(0, 12);
    expect(thermalLightGeometricWeight(0, "constant")).toBe(1);
    expect(thermalLightGeometricWeight(Math.PI, "cosine")).toBeCloseTo(0, 12);
  });

  it("applies phase offsets within the physical alpha interval", () => {
    expect(applyPhaseOffset(0.2, -1)).toBe(0);
    expect(applyPhaseOffset(Math.PI - 0.2, 1)).toBe(Math.PI);
  });
});
