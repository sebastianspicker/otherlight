/**
 * @deprecated Legacy V3 curriculum and progress evaluation system.
 * Superseded by the lesson system in src/didactics/lessons.ts.
 * Kept for backward compatibility only; do not add new callers.
 */
import type {
  AssessmentRubricV3,
  DidacticCurriculumV3,
  HintPolicyV3,
  LearningProgressV3,
  LessonStepV3,
  SimulationDidacticsV3,
} from "../sim/v3/types";

export type WeightedCriterionResult = {
  id: string;
  description: string;
  weight: number;
  passed: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const DEFAULT_PROGRESS_STORAGE_KEY = "exoplanet.didactics.v3.progress";
const PROGRESS_SCHEMA_VERSION = 1;

export function evaluateRubricScore(params: { criteria: WeightedCriterionResult[] }): number {
  const criteria = Array.isArray(params.criteria) ? params.criteria : [];
  if (criteria.length === 0) return 1;

  let total = 0;
  let passed = 0;
  for (const c of criteria) {
    const w = Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 1;
    total += w;
    if (c.passed) passed += w;
  }
  if (!(total > 0)) return 1;
  return passed / total;
}

export function pickActiveLessonStep(
  curriculum: DidacticCurriculumV3,
  progress: LearningProgressV3 | undefined,
): LessonStepV3 {
  const steps = Array.isArray(curriculum.steps) ? curriculum.steps : [];
  if (steps.length === 0) {
    throw new Error("pickActiveLessonStep: curriculum has no steps.");
  }
  const idxRaw = progress?.stepIndex ?? 0;
  const idx = Math.max(0, Math.min(steps.length - 1, Math.floor(idxRaw)));
  return steps[idx];
}

function dependencySatisfied(step: LessonStepV3, progress: LearningProgressV3): boolean {
  const deps = Array.isArray(step.dependsOnStepIds) ? step.dependsOnStepIds : [];
  if (deps.length === 0) return true;
  const passed = new Set(progress.passedStepIds ?? []);
  return deps.every((id) => passed.has(id));
}

function findRubric(
  curriculum: DidacticCurriculumV3,
  rubricId: string | undefined,
): AssessmentRubricV3 | undefined {
  if (!rubricId) return undefined;
  return curriculum.rubrics?.find((r) => r.id === rubricId);
}

function defaultHintFromCheck(id: string, label: string): string {
  if (id.includes("b") || label.toLowerCase().includes("impact")) {
    return "Adjust inclination and observer direction to bring the impact parameter into range.";
  }
  if (id.includes("depth") || label.toLowerCase().includes("depth")) {
    return "Tune radius ratio and limb-darkening settings, then compare geometric and physical transit depth.";
  }
  if (id.includes("rv") || label.toLowerCase().includes("rv")) {
    return "Enable stronger dynamical coupling (N-body or perturber mass) to amplify radial-velocity signatures.";
  }
  if (id.includes("tdv") || label.toLowerCase().includes("timing")) {
    return "Increase timing asymmetry by adjusting moon orbit orientation and dynamical perturbations.";
  }
  return "Change one control at a time and verify the signal trend after each change.";
}

export function applyAdaptiveHints(params: {
  enabled?: boolean;
  strategy?: HintPolicyV3["strategy"];
  maxHintsPerStep?: number;
  failedChecks: Array<{ id: string; label: string }>;
}): string[] {
  if (!params.enabled) return [];
  const failed = Array.isArray(params.failedChecks) ? params.failedChecks : [];
  if (failed.length === 0) return [];

  const maxHints = Number.isFinite(params.maxHintsPerStep)
    ? Math.max(1, Math.floor(params.maxHintsPerStep as number))
    : 3;
  const strategy = params.strategy ?? "adaptive";

  if (strategy === "fixed") {
    return ["Review one parameter at a time and verify each expected signal change before proceeding."];
  }

  const hints: string[] = [];
  for (const c of failed) {
    const hint = defaultHintFromCheck(c.id, c.label);
    if (!hints.includes(hint)) hints.push(hint);
    if (hints.length >= maxHints) break;
  }
  return hints;
}

export function nextLearningProgress(
  progress: LearningProgressV3,
  didactics: Pick<SimulationDidacticsV3, "signals">,
  curriculum: DidacticCurriculumV3,
): LearningProgressV3 {
  let next: LearningProgressV3 = {
    lessonId: progress.lessonId ?? curriculum.id,
    stepIndex: progress.stepIndex ?? 0,
    passedStepIds: Array.isArray(progress.passedStepIds) ? [...progress.passedStepIds] : [],
    lastScore: progress.lastScore,
    updatedAtSec: progress.updatedAtSec,
  };

  const sig = didactics.signals;
  if (!sig?.allChecksPassed || !sig.stepId) return next;

  const step = curriculum.steps.find((s) => s.id === sig.stepId);
  if (!step) return next;
  if (!dependencySatisfied(step, next)) return next;

  if (!next.passedStepIds!.includes(step.id)) {
    next = { ...next, passedStepIds: [...next.passedStepIds!, step.id] };
  }
  const idx = curriculum.steps.findIndex((s) => s.id === step.id);
  if (idx >= 0) {
    next = { ...next, stepIndex: Math.min(curriculum.steps.length - 1, idx + 1) };
  }
  next = { ...next, lastScore: sig.score };
  return next;
}

export function evaluateDidacticsV3(params: {
  curriculum: DidacticCurriculumV3;
  progress: LearningProgressV3;
  signals?: SimulationDidacticsV3["signals"];
  hintPolicy?: HintPolicyV3;
}): {
  rubricScore?: number;
  rubricPass?: boolean;
  hints: string[];
  nextProgress: LearningProgressV3;
} {
  const { curriculum, progress, signals, hintPolicy } = params;
  const active = pickActiveLessonStep(curriculum, progress);
  const rubric = findRubric(curriculum, active.rubricId);

  let rubricScore: number | undefined;
  if (rubric && signals?.checks) {
    const checksById = new Map((signals.checks ?? []).map((c) => [c.id, Boolean(c.passed)]));
    rubricScore = evaluateRubricScore({
      criteria: rubric.criteria.map((c) => ({
        id: c.id,
        description: c.description,
        weight: c.weight,
        passed: checksById.get(c.id) ?? false,
      })),
    });
  }

  const failedChecks = (signals?.checks ?? [])
    .filter((c) => !c.passed)
    .map((c) => ({ id: c.id, label: c.label }));
  const hints = applyAdaptiveHints({
    enabled: hintPolicy?.enabled ?? true,
    strategy: hintPolicy?.strategy ?? "adaptive",
    maxHintsPerStep: hintPolicy?.maxHintsPerStep,
    failedChecks,
  });

  const nextProgress = nextLearningProgress(progress, { signals }, curriculum);
  const rubricPass = rubricScore !== undefined ? rubricScore >= 0.6 : undefined;
  return { rubricScore, rubricPass, hints, nextProgress };
}

export function saveLearningProgressV3(params: {
  progress: LearningProgressV3;
  storage?: StorageLike;
  storageKey?: string;
}): void {
  const storage = params.storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  if (!storage) return;
  const key = params.storageKey ?? DEFAULT_PROGRESS_STORAGE_KEY;
  const envelope = {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    progress: params.progress,
  };
  try {
    storage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Fail-open: browser storage can be unavailable or deny writes in private/hardened modes.
  }
}

export function loadLearningProgressV3(params?: {
  storage?: StorageLike;
  storageKey?: string;
}): LearningProgressV3 | undefined {
  const storage = params?.storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  if (!storage) return undefined;
  const key = params?.storageKey ?? DEFAULT_PROGRESS_STORAGE_KEY;
  const raw = storage.getItem(key);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as {
      schemaVersion?: number;
      progress?: unknown;
    };
    if (parsed.schemaVersion !== PROGRESS_SCHEMA_VERSION) return undefined;
    return sanitizeLearningProgressV3(parsed.progress);
  } catch {
    // Fail-open: corrupt or unparseable localStorage data; discard and return no progress.
    return undefined;
  }
}

function sanitizeLearningProgressV3(progress: unknown): LearningProgressV3 | undefined {
  if (!progress || typeof progress !== "object") return undefined;
  const p = progress as Record<string, unknown>;
  const stepIndex = typeof p.stepIndex === "number" && Number.isFinite(p.stepIndex) ? p.stepIndex : 0;
  const passedStepIds = Array.isArray(p.passedStepIds)
    ? (p.passedStepIds as Array<unknown>).filter((id): id is string => typeof id === "string")
    : [];
  return {
    lessonId: typeof p.lessonId === "string" ? p.lessonId : undefined,
    stepIndex: Math.max(0, Math.floor(stepIndex)),
    passedStepIds,
    lastScore: typeof p.lastScore === "number" && Number.isFinite(p.lastScore) ? p.lastScore : undefined,
    updatedAtSec:
      typeof p.updatedAtSec === "number" && Number.isFinite(p.updatedAtSec) ? p.updatedAtSec : undefined,
  };
}

export function clearLearningProgressV3(params?: { storage?: StorageLike; storageKey?: string }): void {
  const storage = params?.storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  if (!storage) return;
  const key = params?.storageKey ?? DEFAULT_PROGRESS_STORAGE_KEY;
  storage.removeItem(key);
}
