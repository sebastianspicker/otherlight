import { describe, expect, it } from "vitest";

import {
  AU_M,
  DAY_S,
  DEG2RAD,
  EARTH_MASS_KG,
  G_SI,
  JULIAN_YEAR_S,
  RAD2DEG,
  SOLAR_MASS_KG,
  auToM,
  dayToSec,
  kgToSolarMass,
  mToAu,
  secToDay,
  secToYear,
  solarMassToKg,
  yearToSec,
} from "../../src/core/units";

describe("SI constants + conversions", () => {
  it("keeps deg/rad conversions consistent", () => {
    expect(DEG2RAD * RAD2DEG).toBeCloseTo(1, 12);
  });

  it("converts AU and meters consistently", () => {
    expect(auToM(1)).toBeCloseTo(AU_M, 0);
    expect(mToAu(AU_M)).toBeCloseTo(1, 12);
  });

  it("converts day and year seconds consistently", () => {
    expect(dayToSec(1)).toBe(DAY_S);
    expect(secToDay(DAY_S)).toBeCloseTo(1, 12);
    expect(yearToSec(1)).toBeCloseTo(JULIAN_YEAR_S, 12);
    expect(secToYear(JULIAN_YEAR_S)).toBeCloseTo(1, 12);
  });

  it("converts solar mass consistently", () => {
    expect(solarMassToKg(1)).toBeCloseTo(SOLAR_MASS_KG, 6);
    expect(kgToSolarMass(SOLAR_MASS_KG)).toBeCloseTo(1, 12);
  });

  it("exposes expected SI constants", () => {
    expect(G_SI).toBeGreaterThan(0);
    expect(EARTH_MASS_KG).toBeGreaterThan(0);
  });
});
