/** Compact executable contracts for every TypeScript-backed physics registry row. */
import { describe, expect, it } from "vitest";

import { AU_M, G_SI } from "../../src/domain/model/units";
import { trySplitBarycentricPair } from "../../src/domain/orbits/barycenter";
import { tdvRatioFromSkyPlaneSpeeds } from "../../src/domain/orbits/exomoonTiming";
import { perifocalToInertial, projectToSky } from "../../src/domain/orbits/frames";
import { hillRadiusAtDistance, maxStableProgradeMoonAxisDomingos } from "../../src/domain/orbits/hillRadius";
import { solveKeplerE } from "../../src/domain/orbits/kepler";
import { deriveQuadraticLimbDarkeningFromStellarParams } from "../../src/domain/photometry/limbDarkening";
import { reflectedLightGeometricWeight } from "../../src/domain/photometry/dayNightVisibility";
import { boxcarAverageFlux } from "../../src/domain/photometry/smearing";
import { createMulberry32 } from "../../src/domain/photometry/random";

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

  it("keeps dynamical timing diagnostics finite", () => {
    const hill = hillRadiusAtDistance(1, 3e-6, 1);
    expect(maxStableProgradeMoonAxisDomingos(hill)).toBeCloseTo(0.4895 * hill);
    expect(tdvRatioFromSkyPlaneSpeeds(10, 5)).toBe(2);
  });

  it("keeps preview photometry, seeded measurement, and observables bounded", () => {
    const limb = deriveQuadraticLimbDarkeningFromStellarParams({
      teffK: 5772,
      loggCgs: 4.44,
      metallicityDex: 0,
    });
    expect(limb.u1 + limb.u2).toBeLessThanOrEqual(1);
    expect(reflectedLightGeometricWeight(0, "lambert")).toBeCloseTo(1);
    expect(boxcarAverageFlux((t) => t, 0, 2, 2)).toBeCloseTo(0);
    expect(createMulberry32(9).u01()).toBe(createMulberry32(9).u01());
  });
});
