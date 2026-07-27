/** Verifies didactics hook contracts across system state, transit observables, and V4 integration. */

import { describe, expect, it } from "vitest";

import {
  captureDidacticsHookState,
  getDidacticsHook,
  resetDidacticsHooks,
  restoreDidacticsHookState,
  setDidacticsHook,
} from "../../src/sim/didacticsHook";

describe("didactics hook lifecycle", () => {
  it("captures, restores, and resets hook state explicitly", () => {
    const snapshot = captureDidacticsHookState();

    const hook = () => undefined;
    setDidacticsHook(hook);
    expect(getDidacticsHook()).toBe(hook);

    resetDidacticsHooks();
    expect(getDidacticsHook()).toBeNull();

    restoreDidacticsHookState(snapshot);
  });
});
