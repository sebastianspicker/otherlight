import { afterEach, describe, expect, it, vi } from "vitest";

describe("main entrypoint without DOM", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("is a no-op when imported without document", async () => {
    expect(typeof document).toBe("undefined");
    await expect(import("../../src/main")).resolves.toBeDefined();
  });
});
