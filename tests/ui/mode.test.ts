// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { readUiMode, syncUiModeVisibility } from "../../src/ui/mode";
import { readProductMode, syncProductModeVisibility } from "../../src/ui/productMode";

describe("UI mode visibility", () => {
  it("defaults unknown values to normal mode", () => {
    expect(readUiMode("normal")).toBe("normal");
    expect(readUiMode("expert")).toBe("expert");
    expect(readUiMode("")).toBe("normal");
    expect(readUiMode("unexpected")).toBe("normal");
  });

  it("hides expert-tier sections in normal mode and shows them in expert mode", () => {
    document.body.innerHTML = `
      <section id="normalOnly" data-ui-tier="normal">normal</section>
      <section id="expertOnly" data-ui-tier="expert">expert</section>
      <section id="normalQuick" data-ui-tier="normal">quick controls</section>
      <details id="expertDetails" data-ui-tier="expert" open>
        <summary>Advanced</summary>
        <p>expert details</p>
      </details>
    `;

    syncUiModeVisibility("normal");
    expect(document.documentElement.dataset.uiMode).toBe("normal");
    expect((document.getElementById("normalOnly") as HTMLElement).hidden).toBe(false);
    expect((document.getElementById("normalQuick") as HTMLElement).hidden).toBe(false);
    expect((document.getElementById("expertOnly") as HTMLElement).hidden).toBe(true);
    expect((document.getElementById("expertDetails") as HTMLDetailsElement).hidden).toBe(true);
    expect((document.getElementById("expertDetails") as HTMLDetailsElement).open).toBe(false);

    syncUiModeVisibility("expert");
    expect(document.documentElement.dataset.uiMode).toBe("expert");
    expect((document.getElementById("normalOnly") as HTMLElement).hidden).toBe(true);
    expect((document.getElementById("normalQuick") as HTMLElement).hidden).toBe(true);
    expect((document.getElementById("expertOnly") as HTMLElement).hidden).toBe(false);
    expect((document.getElementById("expertDetails") as HTMLDetailsElement).hidden).toBe(false);
  });

  it("keeps mixed normal/expert didactic sections visible in both modes", () => {
    document.body.innerHTML = `
      <details id="sharedDetails" data-ui-tier="normal expert" open>
        <summary>Shared</summary>
        <p>available in both modes</p>
      </details>
    `;

    syncUiModeVisibility("normal");
    expect((document.getElementById("sharedDetails") as HTMLDetailsElement).hidden).toBe(false);
    expect((document.getElementById("sharedDetails") as HTMLDetailsElement).open).toBe(true);

    syncUiModeVisibility("expert");
    expect((document.getElementById("sharedDetails") as HTMLDetailsElement).hidden).toBe(false);
  });

  it("defaults unknown values to simulation product mode", () => {
    expect(readProductMode("simulation")).toBe("simulation");
    expect(readProductMode("lab")).toBe("lab");
    expect(readProductMode("")).toBe("simulation");
    expect(readProductMode("unexpected")).toBe("simulation");
  });

  it("shows product-mode sections only for the active product mode", () => {
    document.body.innerHTML = `
      <section id="simulationOnly" data-product-mode="simulation">simulation</section>
      <section id="labOnly" data-product-mode="lab">lab</section>
      <section id="both" data-product-mode="simulation lab">both</section>
      <details id="labDetails" data-product-mode="lab" open>
        <summary>Lab</summary>
        <p>guided lab</p>
      </details>
    `;

    syncProductModeVisibility("simulation");
    expect(document.documentElement.dataset.productMode).toBe("simulation");
    expect((document.getElementById("simulationOnly") as HTMLElement).hidden).toBe(false);
    expect((document.getElementById("labOnly") as HTMLElement).hidden).toBe(true);
    expect((document.getElementById("both") as HTMLElement).hidden).toBe(false);
    expect((document.getElementById("labDetails") as HTMLDetailsElement).hidden).toBe(true);
    expect((document.getElementById("labDetails") as HTMLDetailsElement).open).toBe(false);

    syncProductModeVisibility("lab");
    expect(document.documentElement.dataset.productMode).toBe("lab");
    expect((document.getElementById("simulationOnly") as HTMLElement).hidden).toBe(true);
    expect((document.getElementById("labOnly") as HTMLElement).hidden).toBe(false);
    expect((document.getElementById("both") as HTMLElement).hidden).toBe(false);
    expect((document.getElementById("labDetails") as HTMLDetailsElement).hidden).toBe(false);
  });
});
