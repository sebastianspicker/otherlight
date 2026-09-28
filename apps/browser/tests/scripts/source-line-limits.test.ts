/** Verifies the production-source physical-line policy boundaries and exclusions. */
import { describe, expect, it } from "vitest";
import {
  countPhysicalLines,
  exceedsLineLimit,
  isProductionSource,
} from "../../../../scripts/check-source-line-limits.mjs";

describe("source-line limit policy", () => {
  it("allows exactly 500 physical lines and rejects 501", () => {
    const withinLimit = Array.from({ length: 500 }, () => "line").join("\n");
    const overLimit = Array.from({ length: 501 }, () => "line").join("\n");
    expect(countPhysicalLines(withinLimit)).toBe(500);
    expect(countPhysicalLines(`${withinLimit}\n`)).toBe(500);
    expect(exceedsLineLimit(withinLimit)).toBe(false);
    expect(countPhysicalLines(overLimit)).toBe(501);
    expect(exceedsLineLimit(overLimit)).toBe(true);
  });

  it("excludes test, generated, vendor, contract, schema, and data paths", () => {
    for (const excludedDirectory of ["tests", "generated", "vendor", "contracts", "schema", "data"])
      expect(isProductionSource(`apps/browser/src/${excludedDirectory}/example.ts`)).toBe(false);
    expect(isProductionSource("apps/browser/src/application/example.ts")).toBe(true);
  });
});
