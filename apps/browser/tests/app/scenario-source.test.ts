/** Characterizes scenario-source browsing without adding a persisted source choice. */
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncScenarioSource, wireScenarioSource } from "../../src/presentation/scenario/scenarioSource";
import { renderScenarioSource } from "../../src/presentation/scenario/templates/scenarioSource";

type DomGlobals = {
  window: typeof window;
  document: typeof document;
  AbortController: typeof AbortController;
  AbortSignal: typeof AbortSignal;
  Event: typeof Event;
};

let dom: JSDOM;
let previous: DomGlobals;

function addOption(select: HTMLSelectElement, label: string, value: string): void {
  const option = document.createElement("option");
  option.textContent = label;
  option.value = value;
  select.add(option);
}

beforeEach(() => {
  dom = new JSDOM(`<!doctype html><body>${renderScenarioSource()}</body>`);
  previous = {
    window: globalThis.window,
    document: globalThis.document,
    AbortController: globalThis.AbortController,
    AbortSignal: globalThis.AbortSignal,
    Event: globalThis.Event,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    AbortController: dom.window.AbortController,
    AbortSignal: dom.window.AbortSignal,
    Event: dom.window.Event,
  });

  const presetSelect = document.getElementById("presetSelect") as HTMLSelectElement;
  addOption(presetSelect, "Default", "default");
  addOption(presetSelect, "Moon", "moon");
  presetSelect.value = "default";
  const realSystemSelect = document.getElementById("realSystemSelect") as HTMLSelectElement;
  addOption(realSystemSelect, "Choose a real system", "");
  addOption(realSystemSelect, "Kepler-16", "kepler-16");
});

afterEach(() => {
  Object.assign(globalThis, previous);
  dom.window.close();
});

function button(id: string): HTMLButtonElement {
  return document.getElementById(id) as HTMLButtonElement;
}

function select(id: string): HTMLSelectElement {
  return document.getElementById(id) as HTMLSelectElement;
}

describe("scenario source", () => {
  it("renders one accessible chooser around the stable native controls", () => {
    expect(document.querySelectorAll(".scenario-source")).toHaveLength(1);
    expect(button("scenarioPresetsBtn").getAttribute("aria-controls")).toBe("scenarioPresetsPanel");
    expect(button("scenarioCatalogBtn").getAttribute("aria-controls")).toBe("scenarioCatalogPanel");
    expect(document.querySelector('label[for="presetSelect"]')).not.toBeNull();
    expect(document.querySelector('label[for="realSystemSelect"]')).not.toBeNull();
    expect(document.getElementById("presetDesc")).not.toBeNull();
    expect(document.getElementById("realSystemMeta")).not.toBeNull();
  });

  it("browses an inactive source without changing the committed model", () => {
    const controller = new AbortController();
    const realSystemSelect = select("realSystemSelect");
    realSystemSelect.value = "kepler-16";
    wireScenarioSource(controller.signal);

    button("scenarioPresetsBtn").click();

    expect(realSystemSelect.value).toBe("kepler-16");
    expect(select("presetSelect").value).toBe("");
    expect(button("scenarioPresetsBtn").getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("scenarioPresetsPanel")?.hidden).toBe(false);
    expect(document.querySelector('[data-scenario-source-caption="preset"]')?.textContent).toContain(
      "will replace the current model",
    );
    controller.abort();
  });

  it("allows the teaching default to be selected when a catalog system is active", () => {
    const controller = new AbortController();
    const presetSelect = select("presetSelect");
    const realSystemSelect = select("realSystemSelect");
    realSystemSelect.value = "kepler-16";
    const applied = vi.fn();
    presetSelect.addEventListener("change", () => {
      realSystemSelect.value = "";
      applied(presetSelect.value);
    });
    wireScenarioSource(controller.signal);

    button("scenarioPresetsBtn").click();
    presetSelect.value = "default";
    presetSelect.dispatchEvent(new Event("change", { bubbles: true }));

    expect(applied).toHaveBeenCalledWith("default");
    expect(realSystemSelect.value).toBe("");
    expect(presetSelect.querySelector("[data-scenario-source-placeholder]")).toBeNull();
    expect(button("scenarioPresetsBtn").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-scenario-source-caption="preset"]')?.textContent).toContain(
      "current model uses a teaching scenario",
    );
    controller.abort();
  });

  it("resets browsing to the source committed by external navigation", () => {
    const controller = new AbortController();
    wireScenarioSource(controller.signal);
    button("scenarioCatalogBtn").click();
    expect(document.getElementById("scenarioCatalogPanel")?.hidden).toBe(false);

    select("realSystemSelect").value = "kepler-16";
    syncScenarioSource();

    expect(button("scenarioCatalogBtn").getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("scenarioCatalogPanel")?.hidden).toBe(false);
    expect(document.querySelector('[data-scenario-source-caption="catalog"]')?.textContent).toContain(
      "current model uses a catalog system",
    );
    controller.abort();
  });

  it("leaves inactive browsing intact when a capture guard cancels selection", () => {
    const controller = new AbortController();
    const presetSelect = select("presetSelect");
    const realSystemSelect = select("realSystemSelect");
    realSystemSelect.value = "kepler-16";
    presetSelect.addEventListener(
      "change",
      (event) => {
        event.stopImmediatePropagation();
        presetSelect.value = "";
      },
      { capture: true },
    );
    wireScenarioSource(controller.signal);

    button("scenarioPresetsBtn").click();
    presetSelect.value = "moon";
    presetSelect.dispatchEvent(new Event("change", { bubbles: true }));

    expect(realSystemSelect.value).toBe("kepler-16");
    expect(document.getElementById("scenarioPresetsPanel")?.hidden).toBe(false);
    expect(document.querySelector('[data-scenario-source-caption="preset"]')?.textContent).toContain(
      "will replace the current model",
    );
    controller.abort();
  });
});
