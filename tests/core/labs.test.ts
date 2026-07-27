/** Verifies labs contracts in shared app and physics primitives. */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAB_SYSTEM,
  LAB_SYSTEMS,
  getLabSystemByControlValue,
  getLabSystemById,
} from "../../src/core/labs";

describe("lab system catalog", () => {
  it("defines one general lab catalog containing transit/exomoon and binary systems", () => {
    expect(LAB_SYSTEMS.map((system) => system.id)).toEqual(["transit-exomoon", "binary-stars"]);
    expect(getLabSystemByControlValue("binary-lab").id).toBe("binary-stars");
    expect(getLabSystemByControlValue("preset-lab").id).toBe("transit-exomoon");
  });

  it("fails unknown identifiers back to the education-first lab system", () => {
    expect(getLabSystemById("unknown")).toBe(DEFAULT_LAB_SYSTEM);
    expect(getLabSystemByControlValue("unknown")).toBe(DEFAULT_LAB_SYSTEM);
  });
});
