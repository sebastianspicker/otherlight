// @vitest-environment jsdom
/** Verifies app shell controls and views for accessible, consistent interaction. */

import { describe, expect, it } from "vitest";

import { createAppDocumentHtml, renderAppShell } from "../../src/ui/appShell";
import { installAppShellDocument } from "../helpers/appShell";

describe("app shell templates", () => {
  it("renders the core DOM contract with stable control ids", () => {
    installAppShellDocument();

    expect(document.getElementById("app")).not.toBeNull();
    expect(document.getElementById("main")).not.toBeNull();
    expect(document.getElementById("productProfileSelect")).not.toBeNull();
    expect(document.getElementById("productModeSelect")).not.toBeNull();
    expect(document.getElementById("realSystemSelect")).not.toBeNull();
    expect(document.getElementById("quickControlsRoot")).not.toBeNull();
    expect(document.getElementById("didLessonSelect")).not.toBeNull();
    expect(document.getElementById("ocCanvas")).not.toBeNull();
    expect(document.getElementById("scientificWorkspace")).not.toBeNull();
  });

  it("mounts the shell into the runtime host container", () => {
    const root = document.createElement("div");
    root.id = "appShellRoot";
    document.body.replaceChildren(root);

    renderAppShell(document.getElementById("appShellRoot") as HTMLElement);

    expect(document.getElementById("app")).not.toBeNull();
    expect(document.body.textContent).toContain("Otherlight");
    expect(document.body.textContent).toContain("Exoplanet learning & scientific modeling");
    expect(document.body.textContent).toContain("Exoplanet learning & scientific modeling");
    expect(document.body.textContent).toContain("Adds a narrow pre-/post-transit brightening term");
  });

  it("uses a real Otherlight heading and semantic navigation without exposing the decorative mark", () => {
    installAppShellDocument();

    expect(document.querySelector("h1")?.textContent).toBe("Otherlight");
    expect(document.querySelector(".brand-mark")?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector('nav[aria-label="Calculation profile"]')).not.toBeNull();
    expect(document.querySelector('nav[aria-label="Education workspace"]')).not.toBeNull();
    expect(document.getElementById("profileEducationBtn")?.getAttribute("aria-current")).toBe("page");
    expect(document.getElementById("modeSimulationBtn")?.getAttribute("aria-current")).toBe("page");
  });

  it("keeps static full-document template parsing out of direct document HTML assignment", () => {
    const parsed = new DOMParser().parseFromString(createAppDocumentHtml(), "text/html");

    expect(parsed.querySelector("#app")).not.toBeNull();
    expect(parsed.querySelector("#main")).not.toBeNull();
  });
});
