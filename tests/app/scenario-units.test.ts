import { describe, expect, it } from "vitest";

import { scenario } from "../../src/app/scenario";

describe("scenario meta units", () => {
  it("declares SI units", () => {
    const units = (scenario as any).meta?.units ?? {};
    expect(units.length).toBe("m");
    expect(units.time).toBe("s");
    expect(units.angles).toBe("rad");
    expect(units.mass).toBe("kg");
  });
});
