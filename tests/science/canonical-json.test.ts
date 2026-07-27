/** Verifies shared canonical Scientific JSON fixtures and request provenance hashes. */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import cases from "../../contracts/science-v5/canonical-json-cases.json";
import contractCases from "../../contracts/science-v5/contract-cases.json";
import { canonicalScientificJson } from "../../src/science/canonicalJson";

describe("scientific canonical JSON", () => {
  it("matches the shared RFC 8785 fixtures", () => {
    for (const fixture of cases.cases) {
      expect(canonicalScientificJson(fixture.value), fixture.id).toBe(fixture.canonical);
    }
  });

  it("rejects non-JSON and non-finite values", () => {
    expect(() => canonicalScientificJson(undefined)).toThrow(/JSON values/);
    expect(() => canonicalScientificJson(Number.NaN)).toThrow(/non-finite/);
  });

  it("produces the shared V5 request provenance hash", () => {
    const digest = createHash("sha256")
      .update(canonicalScientificJson(contractCases.validForwardRequest))
      .digest("hex");
    expect(digest).toBe(contractCases.validForwardRequestCanonicalSha256);
  });
});
