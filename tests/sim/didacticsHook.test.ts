import { describe, expect, it } from "vitest";

import {
  captureDidacticsHookState,
  getDidacticsHook,
  getDidacticsV3Hook,
  resetDidacticsHooks,
  restoreDidacticsHookState,
  setDidacticsHook,
  setDidacticsV3Hook,
} from "../../src/sim/didacticsHook";

describe("didactics hook lifecycle", () => {
  it("captures, restores, and resets hook state explicitly", () => {
    const snapshot = captureDidacticsHookState();

    const hook = () => undefined;
    const hookV3 = () => ({ hints: [], nextProgress: { lessonId: "x", stepIndex: 0, passedStepIds: [] } });
    setDidacticsHook(hook);
    setDidacticsV3Hook(hookV3 as any);
    expect(getDidacticsHook()).toBe(hook);
    expect(getDidacticsV3Hook()).toBe(hookV3);

    resetDidacticsHooks();
    expect(getDidacticsHook()).toBeNull();
    expect(getDidacticsV3Hook()).toBeNull();

    restoreDidacticsHookState(snapshot);
  });
});
