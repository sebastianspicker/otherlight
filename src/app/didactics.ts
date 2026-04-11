import type {
  DidacticResponseStore,
  DidacticSignals,
  LearningState,
  LessonPhaseSpec,
  LessonSimMode,
  StepTimingDiagnostics,
  SystemParams,
} from "../core/types";
import {
  advanceLearningState,
  DEFAULT_LESSON_ID,
  getDefaultLessonIdForSimMode,
  getLessonById,
  getLessonStepPhases,
  getLessonsForSimMode,
  resolveLearningState,
} from "../didactics";
import type { DidacticComparison } from "../didactics/compare";
import type { UiRefs } from "../ui/refs";
import {
  exportDidacticReportView,
  renderDidacticComparisonView,
  renderDidacticSignalsView,
  resolveSelectedDidacticEventTimeView,
} from "./didacticsView";

export type DidacticsRuntimeState = {
  learning: LearningState;
  responses: DidacticResponseStore;
  latestSignals?: DidacticSignals;
  latestTiming?: StepTimingDiagnostics;
  latestComparison?: DidacticComparison;
  latestComparisonText?: string;
};

export function ensureDidacticsConfig(system: SystemParams): SystemParams {
  const prev = system.didactics ?? {};
  return {
    ...system,
    didactics: {
      ...prev,
      enabled: prev.enabled ?? true,
      activeLessonId: prev.activeLessonId ?? DEFAULT_LESSON_ID,
      autoAssess: prev.autoAssess ?? true,
      hintLevel: prev.hintLevel ?? "L1",
      misconceptionChecks: { enabled: prev.misconceptionChecks?.enabled ?? true },
      compareLabs: {
        enabled: prev.compareLabs?.enabled ?? true,
        autoInterpret: prev.compareLabs?.autoInterpret ?? true,
      },
    },
  };
}

export function initDidacticsRuntime(system: SystemParams, tSec: number): DidacticsRuntimeState {
  const learning = resolveLearningState(system, tSec);
  if (system.didactics) {
    system.didactics = { ...system.didactics, learningState: learning };
  }
  return { learning, responses: {} };
}

function activeLesson(runtime: DidacticsRuntimeState) {
  return getLessonById(runtime.learning.lessonId) ?? getLessonById(DEFAULT_LESSON_ID)!;
}

function activePhase(runtime: DidacticsRuntimeState): LessonPhaseSpec | undefined {
  const lesson = activeLesson(runtime);
  const phases = getLessonStepPhases(lesson, runtime.learning.stepIndex);
  return phases[Math.max(0, Math.min(runtime.learning.phaseIndex ?? 0, Math.max(phases.length - 1, 0)))];
}

function currentResponseKey(runtime: DidacticsRuntimeState): string {
  const lesson = activeLesson(runtime);
  const step =
    lesson.steps[Math.max(0, Math.min(runtime.learning.stepIndex, Math.max(lesson.steps.length - 1, 0)))];
  const phase = activePhase(runtime);
  return `${lesson.id}:${step.id}:${phase?.id ?? "phase-0"}`;
}

function normalizeLessonForSimMode(system: SystemParams, simMode: LessonSimMode): string {
  const allowed = getLessonsForSimMode(simMode);
  const current = system.didactics?.activeLessonId ?? DEFAULT_LESSON_ID;
  const next = allowed.some((lesson) => lesson.id === current)
    ? current
    : getDefaultLessonIdForSimMode(simMode);
  if (system.didactics) {
    system.didactics = { ...system.didactics, activeLessonId: next };
  }
  return next;
}

export function syncDidacticsControlsFromParams(
  system: SystemParams,
  refs: UiRefs,
  simMode: LessonSimMode = "preset-lab",
): void {
  const select = refs.didLessonSelect;
  const auto = refs.didAutoAssess;
  const normalizedLessonId = normalizeLessonForSimMode(system, simMode);
  if (select) {
    populateDidacticsControls(refs, simMode);
    select.value = normalizedLessonId;
  }
  if (auto) auto.checked = Boolean(system.didactics?.autoAssess ?? true);
  if (refs.didHintLevelSelect) refs.didHintLevelSelect.value = system.didactics?.hintLevel ?? "L1";
}

export function populateDidacticsControls(refs: UiRefs, simMode: LessonSimMode = "preset-lab"): void {
  const lessonSelect = refs.didLessonSelect;
  if (lessonSelect) {
    lessonSelect.replaceChildren();
    for (const lesson of getLessonsForSimMode(simMode)) {
      const opt = document.createElement("option");
      opt.value = lesson.id;
      const modeTag =
        lesson.simMode === "binary-lab"
          ? "Binary"
          : lesson.recommendedUiMode === "expert"
            ? "Expert"
            : "Normal";
      opt.textContent = `${lesson.title} [${modeTag}]`;
      lessonSelect.appendChild(opt);
    }
  }
}

export function onDidacticSignals(
  system: SystemParams,
  runtime: DidacticsRuntimeState,
  signals: DidacticSignals | undefined,
  timing: StepTimingDiagnostics | undefined,
  tSec: number,
): DidacticsRuntimeState {
  if (!system.didactics?.enabled) return runtime;
  const auto = Boolean(system.didactics.autoAssess ?? true);
  const nextLearning = advanceLearningState(runtime.learning, signals, auto, tSec);
  system.didactics.learningState = nextLearning;
  return {
    learning: nextLearning,
    responses: runtime.responses,
    latestSignals: signals,
    latestTiming: timing,
    latestComparison: runtime.latestComparison,
    latestComparisonText: runtime.latestComparisonText,
  };
}

export function forceNextLessonStep(
  system: SystemParams,
  runtime: DidacticsRuntimeState,
  tSec: number,
): DidacticsRuntimeState {
  const lesson = getLessonById(runtime.learning.lessonId) ?? getLessonById(DEFAULT_LESSON_ID)!;
  const maxStep = Math.max(lesson.steps.length - 1, 0);
  const next = {
    ...runtime.learning,
    stepIndex: Math.min(runtime.learning.stepIndex + 1, maxStep),
    phaseIndex: 0,
    updatedAtSec: tSec,
  };
  if (system.didactics) system.didactics.learningState = next;
  return { ...runtime, learning: next };
}

export function advanceLessonFlow(
  system: SystemParams,
  runtime: DidacticsRuntimeState,
  tSec: number,
): DidacticsRuntimeState {
  const lesson = activeLesson(runtime);
  const phases = getLessonStepPhases(lesson, runtime.learning.stepIndex);
  const currentPhaseIndex = Math.max(
    0,
    Math.min(runtime.learning.phaseIndex ?? 0, Math.max(phases.length - 1, 0)),
  );
  const atLastPhase = currentPhaseIndex >= phases.length - 1;
  const atLastStep = runtime.learning.stepIndex >= lesson.steps.length - 1;
  const nextLearning = atLastPhase
    ? {
        ...runtime.learning,
        stepIndex: atLastStep ? 0 : runtime.learning.stepIndex + 1,
        phaseIndex: 0,
        updatedAtSec: tSec,
      }
    : {
        ...runtime.learning,
        phaseIndex: currentPhaseIndex + 1,
        updatedAtSec: tSec,
      };
  if (system.didactics) system.didactics.learningState = nextLearning;
  return { ...runtime, learning: nextLearning };
}

export function retreatLessonFlow(
  system: SystemParams,
  runtime: DidacticsRuntimeState,
  tSec: number,
): DidacticsRuntimeState {
  const lesson = activeLesson(runtime);
  const phases = getLessonStepPhases(lesson, runtime.learning.stepIndex);
  const currentPhaseIndex = Math.max(
    0,
    Math.min(runtime.learning.phaseIndex ?? 0, Math.max(phases.length - 1, 0)),
  );
  let nextLearning: LearningState;
  if (currentPhaseIndex > 0) {
    nextLearning = {
      ...runtime.learning,
      phaseIndex: currentPhaseIndex - 1,
      updatedAtSec: tSec,
    };
  } else if (runtime.learning.stepIndex > 0) {
    const prevStepIndex = runtime.learning.stepIndex - 1;
    const prevPhases = getLessonStepPhases(lesson, prevStepIndex);
    nextLearning = {
      ...runtime.learning,
      stepIndex: prevStepIndex,
      phaseIndex: Math.max(prevPhases.length - 1, 0),
      updatedAtSec: tSec,
    };
  } else {
    nextLearning = runtime.learning;
  }
  if (system.didactics) system.didactics.learningState = nextLearning;
  return { ...runtime, learning: nextLearning };
}

export function updateDidacticResponse(
  runtime: DidacticsRuntimeState,
  patch: { primary?: string; secondary?: string },
  tSec: number,
): DidacticsRuntimeState {
  const key = currentResponseKey(runtime);
  const prev = runtime.responses[key] ?? {};
  return {
    ...runtime,
    responses: {
      ...runtime.responses,
      [key]: {
        primary: patch.primary ?? prev.primary,
        secondary: patch.secondary ?? prev.secondary,
        updatedAtSec: tSec,
      },
    },
  };
}

export function updateDidacticComparison(
  runtime: DidacticsRuntimeState,
  comparison: DidacticComparison,
  text: string,
): DidacticsRuntimeState {
  return {
    ...runtime,
    latestComparison: comparison,
    latestComparisonText: text,
  };
}

export function renderDidacticSignals(refs: UiRefs, runtime: DidacticsRuntimeState): void {
  renderDidacticSignalsView(refs, runtime);
}

export function exportDidacticReport(system: SystemParams, runtime: DidacticsRuntimeState): void {
  exportDidacticReportView(system, runtime);
}

export function renderDidacticComparison(refs: UiRefs, text: string): void {
  renderDidacticComparisonView(refs, text);
}

export function nextHintLevel(level: "L1" | "L2" | "L3"): "L1" | "L2" | "L3" {
  if (level === "L1") return "L2";
  if (level === "L2") return "L3";
  return "L3";
}

export function previousHintLevel(level: "L1" | "L2" | "L3"): "L1" | "L2" | "L3" {
  if (level === "L3") return "L2";
  if (level === "L2") return "L1";
  return "L1";
}

export function resolveSelectedDidacticEventTime(
  runtime: DidacticsRuntimeState,
  refs: UiRefs,
): number | undefined {
  return resolveSelectedDidacticEventTimeView(runtime, refs);
}
