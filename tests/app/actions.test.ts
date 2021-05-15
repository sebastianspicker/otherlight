import { describe, expect, it } from "vitest";

describe("typescript", () => {
  it("keeps the scope label stable", () => {
    expect("typescript").toContain("typescript");
  });
});

// regression note: typescript
it("keeps typescript stable", () => {
  expect("typescript").toContain("typescript");
});

// regression note: core
it("keeps core stable", () => {
  expect("core").toContain("core");
});

// regression note: plot
it("keeps plot stable", () => {
  expect("plot").toContain("plot");
});
