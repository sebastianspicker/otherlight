import type { LearningState, SystemParams } from "../core/types";
import { clampIndex, currentStepPhases } from "./engineSupport";
import { DEFAULT_LESSON_ID, getLessonById } from "./lessons";

type ActiveLesson = NonNullable<ReturnType<typeof getLessonById>>;

function defaultLearningState(lessonId: string, tSec: number): LearningState {
  return {
    lessonId,
    stepIndex: 0,
    phaseIndex: 0,
    passedStepIds: [],
    updatedAtSec: tSec,
  };
}

function fallbackLearningState(prev: LearningState | undefined, tSec: number): LearningState {
  return prev ? { ...prev } : defaultLearningState(DEFAULT_LESSON_ID, tSec);
}

function learningStateAlreadyNormalized(
  prev: LearningState,
  safeStepIndex: number,
  safePhaseIndex: number,
): boolean {
  const prevPhaseIndex = prev.phaseIndex ?? 0;
  return (
    prev.stepIndex === safeStepIndex && prevPhaseIndex === safePhaseIndex && Array.isArray(prev.passedStepIds)
  );
}

function sanitizedLearningState(
  prev: LearningState,
  safeStepIndex: number,
  safePhaseIndex: number,
  passedStepIds: string[],
): LearningState {
  return {
    lessonId: prev.lessonId,
    stepIndex: safeStepIndex,
    phaseIndex: safePhaseIndex,
    passedStepIds,
    lastScore: prev.lastScore,
    updatedAtSec: prev.updatedAtSec,
  };
}

function normalizedLearningState(prev: LearningState, lesson: ActiveLesson): LearningState {
  const maxStepIndex = Math.max(lesson.steps.length - 1, 0);
  const safeStepIndex = clampIndex(prev.stepIndex, maxStepIndex);
  const phases = currentStepPhases(lesson, safeStepIndex);
  const safePhaseIndex = clampIndex(prev.phaseIndex ?? 0, Math.max(phases.length - 1, 0));
  const passedStepIds = Array.isArray(prev.passedStepIds) ? prev.passedStepIds : [];

  if (learningStateAlreadyNormalized(prev, safeStepIndex, safePhaseIndex)) {
    return prev;
  }

  return sanitizedLearningState(prev, safeStepIndex, safePhaseIndex, passedStepIds);
}

export function resolveLearningState(system: SystemParams, tSec: number): LearningState {
  const did = system.didactics;
  const lesson = getLessonById(did?.activeLessonId ?? DEFAULT_LESSON_ID);
  const prev = did?.learningState;
  if (!lesson) {
    // Unknown lesson ID: preserve previous state unchanged to avoid silent reset every frame.
    return fallbackLearningState(prev, tSec);
  }
  if (!prev || prev.lessonId !== lesson.id) {
    return defaultLearningState(lesson.id, tSec);
  }
  return normalizedLearningState(prev, lesson);
}
