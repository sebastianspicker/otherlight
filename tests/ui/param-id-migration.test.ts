import { describe, expect, it } from "vitest";
import {
  getParamIdMigrationTable,
  migrateParamRecordToLegacy,
  migrateParamRecordToNamespaced,
  toLegacyParamId,
  toNamespacedParamId,
} from "../../src/ui/params/migration";

describe("ui param id migration", () => {
  it("maps known legacy ids to namespaced ids", () => {
    expect(toNamespacedParamId("nbodyMuStar")).toBe("dynamics.nbody.muStar");
    expect(toNamespacedParamId("planetRingInc")).toBe("bodies.planet.rings.inclinationDeg");
  });

  it("maps namespaced ids back to legacy ids", () => {
    expect(toLegacyParamId("dynamics.nbody.muStar")).toBe("nbodyMuStar");
    expect(toLegacyParamId("bodies.planet.rings.inclinationDeg")).toBe("planetRingInc");
  });

  it("migrates records in both directions", () => {
    const legacy = { nbodyMuStar: "1.2", relLTTE: "true", unchanged: "x" };
    const namespaced = migrateParamRecordToNamespaced(legacy);
    expect(namespaced["dynamics.nbody.muStar"]).toBe("1.2");
    expect(namespaced["dynamics.relativity.ltte"]).toBe("true");
    expect(namespaced.unchanged).toBe("x");

    const back = migrateParamRecordToLegacy(namespaced);
    expect(back.nbodyMuStar).toBe("1.2");
    expect(back.relLTTE).toBe("true");
    expect(back.unchanged).toBe("x");
  });

  it("exposes migration table with expected core keys", () => {
    const table = getParamIdMigrationTable();
    expect(table.nbodyMuPlanet).toBe("dynamics.nbody.muPlanet");
    expect(table.relGR).toBe("dynamics.relativity.grPrecession");
  });
});
