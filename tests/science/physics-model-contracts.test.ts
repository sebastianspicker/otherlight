/** Compact executable contracts for every TypeScript-backed physics registry row. */
import { describe, expect, it } from "vitest";

import { AU_M, G_SI } from "../../src/core/units";
import { trySplitBarycentricPair } from "../../src/physics/barycenter";
import { tdvRatioFromSkyPlaneSpeeds } from "../../src/physics/exomoonTiming";
import { perifocalToInertial, projectToSky } from "../../src/physics/frames";
import { hillRadiusAtDistance, maxStableProgradeMoonAxisDomingos } from "../../src/physics/hillRadius";
import { solveKeplerE } from "../../src/physics/kepler";
import { grPrecessionPerOrbit } from "../../src/physics/relativityPrecessionFormula";
import { lightTimeDelaySec, shapiroDelaySec } from "../../src/physics/relativityTiming";
import { fluxUniformDisk } from "../../src/photometry/transitUniform";
import { deriveQuadraticLimbDarkeningFromStellarParams } from "../../src/photometry/limbDarkening";
import { reflectedLightGeometricWeight } from "../../src/photometry/dayNightVisibility";
import { boxcarAverageFlux } from "../../src/photometry/smearing";
import { createMulberry32 } from "../../src/photometry/random";
import { radialVelocityFromState } from "../../src/sim/stateSampler";
import { computePotentialEnergy } from "../../src/sim/nbody/diagnosticsEnergy";

describe("TypeScript physics model contracts", () => {
  it("keeps constants, Kepler states, frame projection, and barycentre splitting in SI", () => {
    expect(AU_M).toBe(149_597_870_700);
    expect(G_SI).toBeCloseTo(6.6743e-11, 16);
    const E = solveKeplerE(1, 0.2);
    expect(E - 0.2 * Math.sin(E)).toBeCloseTo(1, 12);
    expect(perifocalToInertial({ x: 1, y: 0, z: 0 }, 0, 0, 0)).toEqual({ x: 1, y: 0, z: 0 });
    expect(projectToSky({ x: 2, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }).z).toBeCloseTo(2);
    expect(
      trySplitBarycentricPair({
        rBary: { x: 0, y: 0, z: 0 },
        rRel: { x: 3, y: 0, z: 0 },
        mPrimary: 2,
        mSecondary: 1,
      })?.rPrimary.x,
    ).toBeCloseTo(-1);
  });

  it("keeps dynamical, timing, and relativity formulae finite and conventionally signed", () => {
    const hill = hillRadiusAtDistance(1, 3e-6, 1);
    expect(maxStableProgradeMoonAxisDomingos(hill)).toBeCloseTo(0.4895 * hill);
    expect(tdvRatioFromSkyPlaneSpeeds(10, 5)).toBe(2);
    expect(
      computePotentialEnergy({
        positions: [
          { x: 0, y: 0, z: 0 },
          { x: 2, y: 0, z: 0 },
        ],
        velocities: [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
        ],
        mus: [G_SI, 2 * G_SI],
      }),
    ).toBeCloseTo(-G_SI);
    expect(grPrecessionPerOrbit({ mu: 1, a: 2, e: 0, c: 10 })).toBeGreaterThan(0);
    expect(lightTimeDelaySec({ x: 10, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 2)).toBe(-5);
    expect(
      Number.isFinite(
        shapiroDelaySec({ r: { x: 1, y: 1, z: 0 }, observerDir: { x: 1, y: 0, z: 0 }, mu: 1, c: 10 }),
      ),
    ).toBe(true);
  });

  it("keeps preview photometry, seeded measurement, and observables bounded", () => {
    expect(fluxUniformDisk({ rStar: 1, rOcculters: [] })).toBe(1);
    expect(fluxUniformDisk({ rStar: 1, rOcculters: [{ dx: 0, dy: 0, r: 1 }] })).toBe(0);
    const limb = deriveQuadraticLimbDarkeningFromStellarParams({
      teffK: 5772,
      loggCgs: 4.44,
      metallicityDex: 0,
    });
    expect(limb.u1 + limb.u2).toBeLessThanOrEqual(1);
    expect(reflectedLightGeometricWeight(0, "lambert")).toBeCloseTo(1);
    expect(boxcarAverageFlux((t) => t, 0, 2, 2)).toBeCloseTo(0);
    expect(createMulberry32(9).u01()).toBe(createMulberry32(9).u01());
    expect(radialVelocityFromState({ x: 2, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(-2);
  });
});
