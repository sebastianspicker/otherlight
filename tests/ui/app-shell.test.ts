// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { createAppDocumentHtml, renderAppShell } from "../../src/ui/appShell";

describe("app shell templates", () => {
  it("renders the core DOM contract with stable control ids", () => {
    document.documentElement.innerHTML = createAppDocumentHtml();

    expect(document.getElementById("app")).not.toBeNull();
    expect(document.getElementById("main")).not.toBeNull();
    expect(document.getElementById("productModeSelect")).not.toBeNull();
    expect(document.getElementById("realSystemSelect")).not.toBeNull();
    expect(document.getElementById("quickControlsRoot")).not.toBeNull();
    expect(document.getElementById("didLessonSelect")).not.toBeNull();
    expect(document.getElementById("ocCanvas")).not.toBeNull();
  });

  it("mounts the shell into the runtime host container", () => {
    document.body.innerHTML = `<div id="appShellRoot"></div>`;

    renderAppShell(document.getElementById("appShellRoot") as HTMLElement);

    expect(document.getElementById("app")).not.toBeNull();
    expect(document.body.textContent).toContain("Transit-Exomoon-Lightcurve-Simulator");
    expect(document.body.textContent).toContain("Adds a narrow pre-/post-transit brightening term");
  });
});
