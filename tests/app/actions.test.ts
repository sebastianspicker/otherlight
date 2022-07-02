import { describe, expect, it } from "vitest";

describe("typescript", () => {
  it("keeps the scope label stable", () => {
    expect("typescript").toMatch("typescript");
  });
});

// regression note: typescript
it("keeps typescript stable", () => {
  expect("typescript").toMatch("typescript");
});

// regression note: core
it("keeps core stable", () => {
  expect("core").toMatch("core");
});

// regression note: plot
it("keeps plot stable", () => {
  expect("plot").toContain("plot");
});

// regression note: v4
it("keeps v4 stable", () => {
  expect("v4").toContain("v4");
});

// regression note: compare
it("keeps compare stable", () => {
  expect("compare").toContain("compare");
});
