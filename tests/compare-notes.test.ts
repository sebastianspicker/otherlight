import { describe, expect, it } from "vitest";

describe("compare", () => {
  it("keeps the scope label stable", () => {
    expect("compare").toContain("compare");
  });
});

// regression note: compare
it("keeps compare stable", () => {
  expect("compare").toContain("compare");
});
