import { describe, expect, it } from "vitest";

import type { BrightnessPatch } from "../../src/core/types";
import { projectSurfacePatchesToSky } from "../../src/photometry/stellarSurface";

describe("projectSurfacePatchesToSky", () => {
  it("leaves projected patches unchanged when surface projection is disabled", () => {
    const patch: BrightnessPatch = { shape: "circle", x: 1, y: 2, r: 0.1, factor: 0.8 };

    expect(
      projectSurfacePatchesToSky({
        patches: [patch],
        t: 0,
        observerDir: { x: 0, y: 0, z: 1 },
        rStar: 1,
        model: { enabled: false, useSurfacePatches: true },
      }),
    ).toEqual([patch]);
  });

  it("projects visible surface patches and clamps negative brightness factors", () => {
    const [projected] = projectSurfacePatchesToSky({
      patches: [
        {
          shape: "circle",
          x: 0,
          y: 0,
          factor: -0.5,
          surface: { lat: 0, lon: Math.PI / 2, angularRadius: 0.2 },
        },
      ],
      t: 0,
      observerDir: { x: 0, y: 0, z: 1 },
      rStar: 2,
      model: { enabled: true, useSurfacePatches: true, rotationPeriodSec: 100 },
    });

    expect(projected.shape).toBe("circle");
    expect(projected.factor).toBe(0);
    expect(projected.x).toBeCloseTo(0, 12);
    expect(projected.y).toBeCloseTo(0, 12);
    expect(projected.r).toBeCloseTo(2 * Math.sin(0.2), 12);
  });

  it("rotates surface patch longitude with differential rotation", () => {
    const base = {
      patches: [
        {
          shape: "circle" as const,
          x: 0,
          y: 0,
          factor: 0.7,
          surface: { lat: Math.PI / 4, lon: Math.PI / 2, angularRadius: 0.1 },
        },
      ],
      observerDir: { x: 0, y: 0, z: 1 },
      rStar: 1,
      model: {
        enabled: true,
        useSurfacePatches: true,
        rotationPeriodSec: 100,
        differentialRotationK: 0.5,
      },
    };

    const [initial] = projectSurfacePatchesToSky({ ...base, t: 0 });
    const [rotated] = projectSurfacePatchesToSky({ ...base, t: 10 });

    expect(rotated.y).not.toBeCloseTo(initial.y, 12);
  });

  it("keeps non-surface patches and skips invalid or hidden surface patches", () => {
    const projectedPatch: BrightnessPatch = { shape: "circle", x: 1, y: 2, r: 0.1, factor: 0.8 };

    const projected = projectSurfacePatchesToSky({
      patches: [
        projectedPatch,
        { shape: "circle", x: 0, y: 0, factor: 1, surface: { lat: 0, lon: 0, angularRadius: Number.NaN } },
        {
          shape: "circle",
          x: 0,
          y: 0,
          factor: 1,
          surface: { lat: 0, lon: -Math.PI / 2, angularRadius: 0.1 },
        },
      ],
      t: 0,
      observerDir: { x: 0, y: 0, z: 1 },
      rStar: 1,
      model: { enabled: true, useSurfacePatches: true, rotationPeriodSec: 100 },
    });

    expect(projected).toEqual([projectedPatch]);
  });
});
