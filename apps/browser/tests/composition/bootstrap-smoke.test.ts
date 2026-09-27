// @vitest-environment jsdom
/** Boots the real composition root on the rendered shell and checks it wires without a fatal error. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initApp } from "../../src/composition/bootstrap";
import { renderAppShell } from "../../src/presentation/shell/appShell";

/** jsdom has no canvas: a context whose every member is a no-op keeps the wiring under test, not pixels. */
function noOpContext(canvas: HTMLCanvasElement): unknown {
  const callable: object = new Proxy(() => callable, {
    get: (_target, prop) => {
      if (prop === "canvas") return canvas;
      if (prop === "measureText") return () => ({ width: 0 });
      return callable;
    },
    set: () => true,
  });
  return callable;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return noOpContext(this) as RenderingContext;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const text = (id: string): string => document.getElementById(id)?.textContent ?? "";

async function bootOnProductionShell(): Promise<void> {
  document.body.innerHTML = '<div id="appShellRoot"></div>';
  renderAppShell(document.getElementById("appShellRoot"));
  await initApp();
}

describe("composition root", () => {
  it("initializes the Education app on the production shell", async () => {
    await bootOnProductionShell();

    expect(text("appStatusMessage")).toContain("Ready.");
    expect(document.getElementById("fatalError")?.hidden).toBe(true);
    expect(text("warnVal")).not.toMatch(/^Startup:/);
    const presets = document.getElementById("presetSelect") as HTMLSelectElement;
    expect(presets.options.length).toBeGreaterThan(1);
    expect(window.location.search).not.toBe("");
  });

  it("reinitializes over a previous instance without a fatal error", async () => {
    await bootOnProductionShell();
    await bootOnProductionShell();

    expect(text("appStatusMessage")).toContain("Ready.");
    expect(document.getElementById("fatalError")?.hidden).toBe(true);
  });
});
