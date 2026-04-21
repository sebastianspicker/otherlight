// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { installAppShellDocument } from "../helpers/appShell";

describe("main entrypoint", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("boots the app entrypoint", async () => {
    const initApp = vi.fn(async () => {});
    vi.doMock("../../src/app/bootstrap", () => ({ initApp }));
    installAppShellDocument();

    await import("../../src/main");
    await Promise.resolve();

    expect(initApp).toHaveBeenCalledTimes(1);
  });

  it("logs a fatal startup error when bootstrap rejects", async () => {
    const err = new Error("boom");
    const initApp = vi.fn(async () => {
      throw err;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("../../src/app/bootstrap", () => ({ initApp }));
    installAppShellDocument();

    await import("../../src/main");
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalledWith("Fatal: app initialization failed", err);
  });
});
