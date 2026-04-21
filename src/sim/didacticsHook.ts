// src/sim/didacticsHook.ts
//
// Optional didactics computation hooks.
// This decouples the sim/ layer from the didactics/ layer by using a callback pattern.
// The app/ layer wires the concrete implementations via set*Hook() during bootstrap.
// Same pattern as optionalLimbDarkening.ts.

import type { DidacticSignals, SystemParams, StepResult } from "../core/types";

// ── V4 / V2 didactics hook (computeDidacticSignals) ─────────────────────────

export type ComputeDidacticSignalsFn = (
  system: SystemParams,
  step: StepResult,
) => DidacticSignals | undefined;

export type DidacticsHookState = {
  didacticsHook: ComputeDidacticSignalsFn | null;
};

let didacticsHook: ComputeDidacticSignalsFn | null = null;

export function setDidacticsHook(hook: ComputeDidacticSignalsFn): void {
  didacticsHook = hook;
}

export function getDidacticsHook(): ComputeDidacticSignalsFn | null {
  return didacticsHook;
}

export function captureDidacticsHookState(): DidacticsHookState {
  return {
    didacticsHook,
  };
}

export function restoreDidacticsHookState(state: DidacticsHookState): void {
  didacticsHook = state.didacticsHook;
}

export function resetDidacticsHooks(): void {
  didacticsHook = null;
}
