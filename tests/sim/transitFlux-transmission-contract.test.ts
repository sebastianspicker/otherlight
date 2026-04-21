import { describe, expect, it, vi } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { computeTransitFlux } from "../../src/sim/transitFlux";

describe("computeTransitFlux transmission contract", () => {
  it("warns when transmission is enabled for mixed-shape occulters", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const params: SystemParams = {
      star: {
        r: 1,
        photometry: {
          atmosphereTransmission: {
            enabled: true,
            kind: "exponential-halo",
            target: "planet",
            tau0: 1,
            H: 0.2,
          },
        },
      },
      planet: {
        r: 0.1,
        orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
      },
    };

    const flux = computeTransitFlux(
      params,
      [{ kind: "ellipse", dx: 0.05, dy: 0, rx: 0.1, ry: 0.08, angle: 0 }],
      {
        planetOrbit: params.planet.orbit as any,
        rBary: { x: 0, y: 0, z: 0 },
        rPlanetAbs: { x: 0, y: 0, z: 0 },
        planetSky: { x: 0.05, y: 0, z: 1 },
      } as any,
    );

    expect(flux).toBeGreaterThanOrEqual(0);
    expect(warn).toHaveBeenCalledWith(
      "[computeTransitFlux] atmosphere transmission currently applies only to circular occulters; falling back to the non-transmissive mixed-shape solver.",
    );
  });
});
