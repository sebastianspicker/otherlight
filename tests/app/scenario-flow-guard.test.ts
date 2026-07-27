// @vitest-environment jsdom
/** Verifies scenario flow guard contracts across app startup, controls, and runtime integration. */

import { describe, expect, it } from "vitest";
import { withScenarioApplyGuard, type ScenarioApplyGuard } from "../../src/app/scenarioFlow";
import type { UiRefs } from "../../src/ui/refs";

function makeStubRefs(): UiRefs {
  return {
    simModeSelect: null,
    runtimeModeSelect: null,
    presetSelect: null,
    realSystemSelect: null,
    btnApplyParams: null,
    btnResetParams: null,
    btnStart: null,
    btnReset: null,
    btnClearLC: null,
  } as unknown as UiRefs;
}

describe("scenario apply guard", () => {
  it("runs pending callback after current apply completes", async () => {
    document.body.innerHTML = `<main id="main"></main>`;
    const refs = makeStubRefs();
    const guard: ScenarioApplyGuard = { applying: false };
    const order: string[] = [];
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const inFlight = withScenarioApplyGuard(guard, refs, null, async () => {
      order.push("first:start");
      await gate;
      order.push("first:end");
    });
    void withScenarioApplyGuard(guard, refs, null, async () => {
      order.push("second");
    });

    release();
    await inFlight;

    expect(order).toEqual(["first:start", "first:end", "second"]);
    expect(guard.applying).toBe(false);
    expect(guard.pendingRun ?? null).toBeNull();
    expect(document.getElementById("main")?.getAttribute("aria-busy")).toBe("false");
  });

  it("keeps only the latest pending callback while apply is in-flight", async () => {
    document.body.innerHTML = `<main id="main"></main>`;
    const refs = makeStubRefs();
    const guard: ScenarioApplyGuard = { applying: false };
    const order: string[] = [];
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const inFlight = withScenarioApplyGuard(guard, refs, null, async () => {
      order.push("first:start");
      await gate;
      order.push("first:end");
    });
    void withScenarioApplyGuard(guard, refs, null, async () => {
      order.push("second");
    });
    void withScenarioApplyGuard(guard, refs, null, async () => {
      order.push("third");
    });

    release();
    await inFlight;

    expect(order).toEqual(["first:start", "first:end", "third"]);
  });
});
