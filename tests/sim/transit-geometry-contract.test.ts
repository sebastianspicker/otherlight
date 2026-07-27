/** Verifies transit geometry remains consistent across state, observables, and V4 execution. */

import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { computeExoDiagnostics } from "../../src/sim/diagnostics";
import type { BodyKinematics } from "../../src/sim/kinematics";

function makeParams(): SystemParams {
  return {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 2, m: 1 },
    planet: {
      r: 0.2,
      m: 0.001,
      orbit: { a: 5, e: 0, inc: 0.4, Omega: 0.2, omega: 0.1, period: 100, t0: 0 },
    },
  };
}

function makeKinematics(planetSky: BodyKinematics["planetSky"]): BodyKinematics {
  return {
    planetOrbit: { a: 5, e: 0, inc: 0.4, Omega: 0.2, omega: 0.1, period: 100, t0: 0 },
    rBary: { x: 0, y: 0, z: 0 },
    rPlanetAbs: { x: 0, y: 0, z: 5 },
    planetSky,
  };
}

describe("transit geometry diagnostics", () => {
  it("uses full projected separation for the planet impact parameter", () => {
    const params = makeParams();
    const kin = makeKinematics({ x: 3, y: 4, z: 5 });

    const diag = computeExoDiagnostics(params, 0, { x: 0, y: 0, z: 1 }, kin);

    expect(diag.bPlanet).toBeCloseTo(2.5, 12);
  });

  it("omits the impact parameter when the planet is behind the star plane", () => {
    const params = makeParams();
    const kin = makeKinematics({ x: 0.5, y: 0.25, z: -1 });

    const diag = computeExoDiagnostics(params, 0, { x: 0, y: 0, z: 1 }, kin);

    expect(diag.bPlanet).toBeUndefined();
  });
});
