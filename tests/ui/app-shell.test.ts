// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { createAppDocumentHtml, renderAppShell } from "../../src/ui/appShell";
import { installAppShellDocument } from "../helpers/appShell";

describe("app shell templates", () => {
  it("renders the core DOM contract with stable control ids", () => {
    installAppShellDocument();

    expect(document.getElementById("app")).not.toBeNull();
    expect(document.getElementById("main")).not.toBeNull();
    expect(document.getElementById("productModeSelect")).not.toBeNull();
    expect(document.getElementById("realSystemSelect")).not.toBeNull();
    expect(document.getElementById("quickControlsRoot")).not.toBeNull();
    expect(document.getElementById("didLessonSelect")).not.toBeNull();
    expect(document.getElementById("ocCanvas")).not.toBeNull();
  });

  it("mounts the shell into the runtime host container", () => {
    const root = document.createElement("div");
    root.id = "appShellRoot";
    document.body.replaceChildren(root);

    renderAppShell(document.getElementById("appShellRoot") as HTMLElement);

    expect(document.getElementById("app")).not.toBeNull();
    expect(document.body.textContent).toContain("Transit Light-Curve Lab");
    expect(document.body.textContent).toContain("Adds a narrow pre-/post-transit brightening term");
  });

  it("keeps static full-document template parsing out of direct document HTML assignment", () => {
    const parsed = new DOMParser().parseFromString(createAppDocumentHtml(), "text/html");

    expect(parsed.querySelector("#app")).not.toBeNull();
    expect(parsed.querySelector("#main")).not.toBeNull();
  });
});
