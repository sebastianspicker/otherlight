// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { installAppShellDocument } from "../helpers/appShell";
import { validateParamForm, getParamUiMeta, renderParamValidationErrors } from "../../src/ui/paramValidation";

describe("scientific parameter validation", () => {
  it("rejects empty and out-of-range values without replacing the entered text", () => {
    installAppShellDocument();
    const form = document.getElementById("paramForm") as HTMLFormElement;
    const starR = document.getElementById("starR") as HTMLInputElement;
    const planetE = document.getElementById("planetE") as HTMLInputElement;
    starR.value = "";
    planetE.value = "0.97";

    const errors = validateParamForm(form);

    expect(errors.map((error) => error.fieldId)).toEqual(expect.arrayContaining(["starR", "planetE"]));
    expect(starR.value).toBe("");
    expect(planetE.value).toBe("0.97");
  });

  it("rejects incompatible ring radii and a zero observer vector", () => {
    installAppShellDocument();
    const form = document.getElementById("paramForm") as HTMLFormElement;
    (document.getElementById("uiModeSelect") as HTMLSelectElement).value = "expert";
    (document.getElementById("observerX") as HTMLInputElement).value = "0";
    (document.getElementById("observerY") as HTMLInputElement).value = "0";
    (document.getElementById("observerZ") as HTMLInputElement).value = "0";
    (document.getElementById("planetRingsEnabled") as HTMLInputElement).checked = true;
    (document.getElementById("planetRingInner") as HTMLInputElement).value = "10";
    (document.getElementById("planetRingOuter") as HTMLInputElement).value = "9";

    const errors = validateParamForm(form);

    expect(errors.map((error) => error.fieldId)).toEqual(
      expect.arrayContaining(["observerX", "planetRingOuter"]),
    );
  });

  it("derives human labels and renders linked inline errors", () => {
    installAppShellDocument();
    const form = document.getElementById("paramForm") as HTMLFormElement;
    const input = document.getElementById("planetR") as HTMLInputElement;
    const summary = document.getElementById("paramErrorSummary");
    const meta = getParamUiMeta(input);

    renderParamValidationErrors(
      form,
      [{ fieldId: "planetR", label: meta.label, message: "Planet radius is invalid." }],
      summary,
    );

    expect(meta.label).toBe("Planet radius");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("planetR-error");
    expect(document.getElementById("planetR-error")?.textContent).toContain("Planet radius");
  });
});
