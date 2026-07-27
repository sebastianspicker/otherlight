// @vitest-environment jsdom
/** Verifies scenario flow UI contracts across app startup, controls, and runtime integration. */

import { describe, expect, it } from "vitest";

import { syncBinaryLabUiState } from "../../src/app/scenarioFlow";
import { createBinaryLabState } from "../../src/didactics/binaryLab";
import type { UiRefs } from "../../src/ui/refs";

function selectWithValue(value: string): HTMLSelectElement {
  const select = document.createElement("select");
  const option = document.createElement("option");
  option.value = value;
  select.append(option);
  select.value = value;
  return select;
}

function makeBinaryLabRefs(): UiRefs {
  return {
    skyCanvas: document.createElement("canvas"),
    productModeSelect: selectWithValue("lab"),
    simModeSelect: selectWithValue("binary-lab"),
    didBinaryControls: document.createElement("section"),
    didHypothesisSelect: document.createElement("select"),
    didRevealSkyBtn: document.createElement("button"),
    skyBlackboxHint: document.createElement("p"),
  } as unknown as UiRefs;
}

describe("syncBinaryLabUiState", () => {
  it("keeps black-box Binary Lab sky hidden and parameter controls locked before a hypothesis", () => {
    document.body.innerHTML = `
      <form id="paramForm"><input id="lockedInput" /></form>
      <section id="binaryLabParamNotice"></section>
      <section id="ocSection"></section>
      <p id="skySummary"></p>
    `;
    const refs = makeBinaryLabRefs();
    const state = createBinaryLabState({
      hideSkyUntilReveal: true,
      requireHypothesis: true,
      lockParamsUntilHypothesis: true,
    });

    syncBinaryLabUiState(refs, state);

    expect(refs.didBinaryControls?.hidden).toBe(false);
    expect(refs.didHypothesisSelect?.disabled).toBe(false);
    expect(refs.didRevealSkyBtn?.disabled).toBe(true);
    expect(refs.skyBlackboxHint?.hidden).toBe(false);
    expect(refs.skyCanvas.classList.contains("skyCanvas--hidden")).toBe(true);
    expect((document.getElementById("lockedInput") as HTMLInputElement).disabled).toBe(true);
    expect(document.getElementById("paramForm")?.hidden).toBe(true);
    expect(document.getElementById("binaryLabParamNotice")?.hidden).toBe(false);
    expect(document.getElementById("ocSection")?.hidden).toBe(true);
    expect(document.getElementById("skySummary")?.textContent).toContain("is hidden until a hypothesis");

    syncBinaryLabUiState(
      refs,
      createBinaryLabState({
        hideSkyUntilReveal: false,
        requireHypothesis: true,
        lockParamsUntilHypothesis: true,
      }),
    );
    expect(refs.skyCanvas.classList.contains("skyCanvas--hidden")).toBe(false);
    expect(refs.skyBlackboxHint?.hidden).toBe(true);
    expect(document.getElementById("skySummary")?.textContent).toContain("geometry revealed");
  });
});
