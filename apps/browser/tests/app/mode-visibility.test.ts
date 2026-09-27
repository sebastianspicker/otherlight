/** Verifies that independent product and UI visibility axes compose by intersection. */
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { syncUiModeVisibility } from "../../src/presentation/ui/mode";
import { syncProductModeVisibility } from "../../src/presentation/ui/productMode";
import { syncProductProfileVisibility } from "../../src/presentation/ui/productProfile";

type DomGlobals = {
  window: typeof window;
  document: typeof document;
  Document: typeof Document;
  HTMLDetailsElement: typeof HTMLDetailsElement;
};

let dom: JSDOM;
let previous: DomGlobals;

beforeEach(() => {
  dom = new JSDOM(`<!doctype html><body>
    <main id="education" data-product-profile="education">
      <label id="runtimeMode" data-ui-tier="expert" data-product-mode="simulation"></label>
    </main>
    <section id="scientific" data-product-profile="scientific" hidden></section>
  </body>`);
  previous = {
    window: globalThis.window,
    document: globalThis.document,
    Document: globalThis.Document,
    HTMLDetailsElement: globalThis.HTMLDetailsElement,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Document: dom.window.Document,
    HTMLDetailsElement: dom.window.HTMLDetailsElement,
  });
});

afterEach(() => {
  Object.assign(globalThis, previous);
  dom.window.close();
});

function element(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

describe("mode visibility", () => {
  it("keeps expert simulation controls hidden after a lab round trip in Essential mode", () => {
    syncUiModeVisibility("normal");
    syncProductModeVisibility("simulation");
    expect(element("runtimeMode").hidden).toBe(true);

    syncProductModeVisibility("lab");
    expect(element("runtimeMode").hidden).toBe(true);

    syncProductModeVisibility("simulation");
    expect(element("runtimeMode").hidden).toBe(true);
  });

  it("composes Simulation and Advanced transitions in the opposite order", () => {
    syncProductModeVisibility("lab");
    syncUiModeVisibility("expert");
    expect(element("runtimeMode").hidden).toBe(true);

    syncProductModeVisibility("simulation");
    expect(element("runtimeMode").hidden).toBe(false);

    syncUiModeVisibility("normal");
    expect(element("runtimeMode").hidden).toBe(true);

    syncUiModeVisibility("expert");
    expect(element("runtimeMode").hidden).toBe(false);
  });

  it("keeps Education and Scientific surfaces mutually exclusive", () => {
    syncProductProfileVisibility("education");
    expect(element("education").hidden).toBe(false);
    expect(element("scientific").hidden).toBe(true);

    syncProductProfileVisibility("scientific");
    expect(element("education").hidden).toBe(true);
    expect(element("scientific").hidden).toBe(false);

    syncProductProfileVisibility("education");
    expect(element("education").hidden).toBe(false);
    expect(element("scientific").hidden).toBe(true);
  });
});
