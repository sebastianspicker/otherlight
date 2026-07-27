// @vitest-environment jsdom
/** Verifies param validation controls and views for accessible, consistent interaction. */

import { describe, expect, it } from "vitest";
import { installAppShellDocument } from "../helpers/appShell";
import {
  getParamUiMeta,
  readValidatedUIIntoParams,
  renderParamValidationErrors,
  validateParamForm,
} from "../../src/ui/paramValidation";

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

  it("uses scenario normal bounds instead of stale template attributes", () => {
    installAppShellDocument();
    const form = document.getElementById("paramForm") as HTMLFormElement;
    (document.getElementById("planetE") as HTMLInputElement).value = "0.4";
    (document.getElementById("planetInc") as HTMLInputElement).value = "70";

    const errors = validateParamForm(form);

    expect(errors.map((error) => error.fieldId)).toEqual(expect.arrayContaining(["planetE", "planetInc"]));
  });

  it("enforces the live compute budget even when range overrides are enabled", () => {
    installAppShellDocument();
    const form = document.getElementById("paramForm") as HTMLFormElement;
    (document.getElementById("overrideMode") as HTMLInputElement).checked = true;
    (document.getElementById("smearEnabled") as HTMLInputElement).checked = true;
    (document.getElementById("gridRes") as HTMLInputElement).value = "1024";
    (document.getElementById("nSubsamples") as HTMLInputElement).value = "512";

    const errors = validateParamForm(form);

    expect(errors).toContainEqual(
      expect.objectContaining({
        fieldId: "nSubsamples",
        message: expect.stringContaining("no more than 1 at grid resolution 1024"),
      }),
    );
  });

  it("uses the submitted spectral workload for enabled transmission smearing", async () => {
    installAppShellDocument();
    const form = document.getElementById("paramForm") as HTMLFormElement;
    const { uiRefs } = await import("../../src/ui/refs");
    const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");
    (document.getElementById("smearEnabled") as HTMLInputElement).checked = true;
    (document.getElementById("gridRes") as HTMLInputElement).value = "220";
    (document.getElementById("nSubsamples") as HTMLInputElement).value = "20";
    (document.getElementById("atmEnabled") as HTMLInputElement).checked = true;
    (document.getElementById("atmLambdaNm") as HTMLInputElement).value = "500, 600, 700";

    const result = readValidatedUIIntoParams(
      cloneParams(SCENARIO_DEFAULTS),
      uiRefs,
      cloneParams(SCENARIO_DEFAULTS),
      form,
    );

    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("Expected the spectral smearing input to be rejected.");
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        fieldId: "nSubsamples",
        message: expect.stringContaining("no more than 6 at grid resolution 220"),
      }),
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
