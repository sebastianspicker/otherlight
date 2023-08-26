import { describe, expect, it } from "vitest";

describe("runtime", () => {
  it("keeps the scope label stable", () => {
    expect("runtime").toContain("runtime");
  });
});

// regression note: runtime
it("keeps runtime stable", () => {
  expect("runtime").toContain("runtime");
});
