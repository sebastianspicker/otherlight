// src/sim/didacticsHook.ts
//
// Optional didactics computation hooks.
// This decouples the sim/ layer from the didactics/ layer by using a callback pattern.
// The app/ layer wires the concrete implementations via set*Hook() during bootstrap.
// Same pattern as optionalLimbDarkening.ts.

import type { DidacticSignals, SystemParams, StepResult } from "../core/types";
import type {
  DidacticCurriculumV3,
  HintPolicyV3,
  LearningProgressV3,
  SimulationDidacticsV3,
} from "./v3/types";

// ── V4 / V2 didactics hook (computeDidacticSignals) ─────────────────────────

export type ComputeDidacticSignalsFn = (
  system: SystemParams,
  step: StepResult,
) => DidacticSignals | undefined;

let didacticsHook: ComputeDidacticSignalsFn | null = null;

export function setDidacticsHook(hook: ComputeDidacticSignalsFn): void {
  didacticsHook = hook;
}

export function getDidacticsHook(): ComputeDidacticSignalsFn | null {
  return didacticsHook;
}

// ── V3 didactics hook (evaluateDidacticsV3) ──────────────────────────────────

export type EvaluateDidacticsV3Fn = (params: {
  curriculum: DidacticCurriculumV3;
  progress: LearningProgressV3;
  signals?: SimulationDidacticsV3["signals"];
  hintPolicy?: HintPolicyV3;
}) => {
  rubricScore?: number;
  hints: string[];
  nextProgress: LearningProgressV3;
};

let didacticsV3Hook: EvaluateDidacticsV3Fn | null = null;

export function setDidacticsV3Hook(hook: EvaluateDidacticsV3Fn): void {
  didacticsV3Hook = hook;
}

export function getDidacticsV3Hook(): EvaluateDidacticsV3Fn | null {
  return didacticsV3Hook;
}
