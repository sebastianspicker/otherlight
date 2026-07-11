// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { showFatalAppError } from "../../src/ui/fatalError";
import { installAppShellDocument } from "../helpers/appShell";

describe("fatal application error", () => {
  beforeEach(() => {
    installAppShellDocument();
  });

  it("shows safe recovery guidance, preserves the status structure, and reloads on request", () => {
    const reload = vi.fn();

    showFatalAppError(new Error("bad <script>state</script>"), { reload });

    const fatal = document.getElementById("fatalError");
    expect(fatal).not.toBeNull();
    expect(fatal?.hidden).toBe(false);
    expect(document.activeElement).toBe(fatal);
    expect(document.getElementById("fatalErrorMessage")?.textContent).toContain("bad <script>state</script>");
    expect(document.querySelector("#fatalErrorMessage script")).toBeNull();
    expect(document.getElementById("appStatusMessage")?.textContent).toContain("Initialization failed");
    expect(document.getElementById("appRetryBtn")).not.toBeNull();

    document.getElementById("fatalReloadBtn")?.click();
    document.getElementById("fatalReloadBtn")?.click();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
