/** Resolves lesson phases and manages lesson event and navigation controls. */
import type {
  DidacticResponseStore,
  DidacticSignals,
  LearningState,
  LessonEventTarget,
  StepTimingDiagnostics,
} from "../../domain/model/types";
import {
  DEFAULT_LESSON_ID,
  getLessonById,
  getLessonStepPhases,
  LESSON_EVENT_TARGET_LABELS,
} from "../../domain/education";
import type { DidacticComparison } from "../../domain/education/compare";
import type { UiRefs } from "../shell/refs";

export type DidacticsViewRuntimeState = {
  learning: LearningState;
  responses: DidacticResponseStore;
  latestSignals?: DidacticSignals;
  latestTiming?: StepTimingDiagnostics;
  latestComparison?: DidacticComparison;
  latestComparisonText?: string;
};

type LessonSpecView = ReturnType<typeof getLessonById>;

const activePhase = (runtime: DidacticsViewRuntimeState) => {
  const lesson = getLessonById(runtime.learning.lessonId) ?? getLessonById(DEFAULT_LESSON_ID)!;
  const phases = getLessonStepPhases(lesson, runtime.learning.stepIndex);
  return phases[Math.max(0, Math.min(runtime.learning.phaseIndex ?? 0, Math.max(phases.length - 1, 0)))];
};

export const currentResponseKey = (runtime: DidacticsViewRuntimeState): string => {
  const lesson = getLessonById(runtime.learning.lessonId) ?? getLessonById(DEFAULT_LESSON_ID)!;
  const step =
    lesson.steps[Math.max(0, Math.min(runtime.learning.stepIndex, Math.max(lesson.steps.length - 1, 0)))];
  const phase = activePhase(runtime);
  return `${lesson.id}:${step.id}:${phase?.id ?? "phase-0"}`;
};

export const renderLessonNavigation = (
  refs: UiRefs,
  runtime: DidacticsViewRuntimeState,
  signals: DidacticSignals | undefined,
): void => {
  const lesson = getLessonById(runtime.learning.lessonId);
  renderEventTargetSelect(refs, runtime, signals, lesson);
  syncLessonNavigationControls(refs, runtime, lesson);
};

export const resolveSelectedDidacticEventTime = (
  runtime: DidacticsViewRuntimeState,
  refs: UiRefs,
): number | undefined => {
  const target = refs.didEventTargetSelect?.value as LessonEventTarget | undefined;
  return resolveLessonEventSec(runtime.latestTiming, target);
};

export const resolveLessonEventSec = (
  timing: StepTimingDiagnostics | undefined,
  target: LessonEventTarget | undefined,
): number | undefined => {
  if (!timing || !target) return undefined;
  const lookup: Record<LessonEventTarget, number | undefined> = {
    planetIngress: timing.planetIngressSec,
    planetMidTransit: timing.planetTransitCenterSec,
    planetEgress: timing.planetEgressSec,
    moonIngress: timing.moonIngressSec,
    moonMidTransit: timing.moonTransitCenterSec,
    moonEgress: timing.moonEgressSec,
  };
  const value = lookup[target];
  return Number.isFinite(value) ? value : undefined;
};

const renderEventTargetSelect = (
  refs: UiRefs,
  runtime: DidacticsViewRuntimeState,
  signals: DidacticSignals | undefined,
  lesson: LessonSpecView,
): void => {
  const select = refs.didEventTargetSelect;
  if (!select) return;
  const previousSelection = select.value;
  select.replaceChildren();
  const targets = eventTargetsFor(signals, lesson);
  if (targets.length === 0) appendNoEventTargetOption(select);
  for (const target of targets) appendEventTargetOption(select, runtime.latestTiming, target);
  restoreEventTargetSelection(select, previousSelection);
};

const eventTargetsFor = (
  signals: DidacticSignals | undefined,
  lesson: LessonSpecView,
): LessonEventTarget[] => {
  const defaultTargets = signals?.eventTargets ?? lesson?.eventTargets ?? [];
  if (!signals?.phaseEventTarget) return defaultTargets;
  return [
    signals.phaseEventTarget,
    ...defaultTargets.filter((target) => target !== signals.phaseEventTarget),
  ];
};

const appendNoEventTargetOption = (select: HTMLSelectElement): void => {
  const option = document.createElement("option");
  option.value = "";
  option.textContent = "No timed lesson events";
  option.disabled = true;
  option.selected = true;
  select.appendChild(option);
};

const appendEventTargetOption = (
  select: HTMLSelectElement,
  timing: StepTimingDiagnostics | undefined,
  target: LessonEventTarget,
): void => {
  const option = document.createElement("option");
  const seconds = resolveLessonEventSec(timing, target);
  option.value = target;
  option.textContent = eventTargetLabel(target, seconds);
  option.disabled = seconds === undefined;
  select.appendChild(option);
};

const eventTargetLabel = (target: LessonEventTarget, seconds: number | undefined): string => {
  return seconds === undefined
    ? `${LESSON_EVENT_TARGET_LABELS[target]} (not available yet)`
    : `${LESSON_EVENT_TARGET_LABELS[target]} @ ${seconds.toFixed(0)} s`;
};

const restoreEventTargetSelection = (select: HTMLSelectElement, previousSelection: string): void => {
  const previousOption = Array.from(select.options).find(
    (option) => option.value === previousSelection && !option.disabled,
  );
  const nextOption = previousOption ?? Array.from(select.options).find((option) => !option.disabled);
  if (nextOption) select.value = nextOption.value;
};

const syncLessonNavigationControls = (
  refs: UiRefs,
  runtime: DidacticsViewRuntimeState,
  lesson: LessonSpecView,
): void => {
  if (refs.didJumpEventBtn) {
    const target = refs.didEventTargetSelect?.value as LessonEventTarget | undefined;
    refs.didJumpEventBtn.disabled =
      !target || resolveLessonEventSec(runtime.latestTiming, target) === undefined;
  }
  if (refs.didPrevBtn) {
    refs.didPrevBtn.disabled = runtime.learning.stepIndex === 0 && (runtime.learning.phaseIndex ?? 0) === 0;
  }
  if (refs.didNextBtn) refs.didNextBtn.textContent = nextButtonText(runtime, lesson);
};

const nextButtonText = (runtime: DidacticsViewRuntimeState, lesson: LessonSpecView): string => {
  const activeLessonSpec = lesson ?? getLessonById(DEFAULT_LESSON_ID);
  const stepCount = activeLessonSpec?.steps.length ?? 1;
  const phases = activeLessonSpec ? getLessonStepPhases(activeLessonSpec, runtime.learning.stepIndex) : [];
  const atLastPhase = (runtime.learning.phaseIndex ?? 0) >= Math.max(phases.length - 1, 0);
  const atLastStep = runtime.learning.stepIndex >= stepCount - 1;
  return atLastPhase ? (atLastStep ? "Restart lesson" : "Next step") : "Next phase";
};
