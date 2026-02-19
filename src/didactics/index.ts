export { LESSONS, DEFAULT_LESSON_ID, getLessonById } from "./lessons";
export { computeDidacticSignals, resolveLearningState, advanceLearningState } from "./engine";
export { compareScenariosAtTime, interpretDidacticComparison } from "./compare";
export { buildLessonReportMarkdown } from "./report";
export {
  applyAdaptiveHints,
  evaluateDidacticsV3,
  evaluateRubricScore,
  nextLearningProgress,
  pickActiveLessonStep,
  loadLearningProgressV3,
  saveLearningProgressV3,
  clearLearningProgressV3,
} from "./v3";
