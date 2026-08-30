/** Exposes the supported didactics surface without leaking internal lesson helpers. */
export {
  LESSONS,
  DEFAULT_LESSON_ID,
  LESSON_EVENT_TARGET_LABELS,
  LESSON_FAMILY_LABELS,
  LESSON_FOCUS_CONTROL_LABELS,
  getDefaultLessonIdForSimMode,
  getLessonById,
  getLessonStepPhases,
  getLessonsForSimMode,
} from "./lessons";
export { computeDidacticSignals, resolveLearningState, advanceLearningState } from "./engine";
export { compareScenariosAtTime, interpretDidacticComparison } from "./compare";
export { buildLessonReportMarkdown } from "./report";
