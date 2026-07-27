// @vitest-environment jsdom
/** Verifies run with error handling contracts across app startup, controls, and runtime integration. */

import { describe, expect, it, vi } from "vitest";
import { runWithErrorHandling } from "../../src/app/runWithErrorHandling";

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("runWithErrorHandling", () => {
  it("does not let an older async success overwrite a newer error on the same status element", async () => {
    const statusEl = document.createElement("div");
    let releaseOld = () => {};
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });

    runWithErrorHandling(async () => oldGate, {
      statusEl,
      getSuccessMessage: () => "old success",
    });
    runWithErrorHandling(
      async () => {
        throw new Error("new failure");
      },
      {
        statusEl,
        errorPrefix: "Failed: ",
      },
    );

    await flushMicrotasks();
    expect(statusEl.textContent).toBe("Failed: new failure");

    releaseOld();
    await flushMicrotasks();
    expect(statusEl.textContent).toBe("Failed: new failure");
  });

  it("does not let an older async error overwrite a newer success on the same status element", async () => {
    const statusEl = document.createElement("div");
    let rejectOld = (_error: Error) => {};
    const oldGate = new Promise<void>((_, reject) => {
      rejectOld = reject;
    });

    runWithErrorHandling(async () => oldGate, {
      statusEl,
      errorPrefix: "Failed: ",
    });
    runWithErrorHandling(async () => undefined, {
      statusEl,
      getSuccessMessage: () => "new success",
    });

    await flushMicrotasks();
    expect(statusEl.textContent).toBe("new success");

    rejectOld(new Error("old failure"));
    await flushMicrotasks();
    expect(statusEl.textContent).toBe("new success");
  });

  it("still logs errors when no status element is available", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      runWithErrorHandling(
        async () => {
          throw new Error("missing status");
        },
        {
          statusEl: null,
          errorPrefix: "Failed: ",
        },
      );

      await flushMicrotasks();
      expect(errorSpy).toHaveBeenCalledWith("[runWithErrorHandling]", "Failed: missing status");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
