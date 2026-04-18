/**
 * @deprecated V3 runtime factory functions (createSimulation, sampleRangeSeconds) are deprecated.
 * Use the V4 engine (src/sim/v4) for new code.
 *
 * NOTE: V3 types (SimulationStepV3, RenderSignalsV3, etc.) are still used by V4 adapters
 * and are NOT deprecated — only the runtime factory functions should be avoided.
 */
export type {
  AssessmentRubricV3,
  DidacticCurriculumV3,
  DidacticsModuleConfigV3,
  PhysicsDiagnosticsV3,
  RenderConfigV3,
  RenderSignalsV3,
  HintPolicyV3,
  LearningProgressV3,
  LessonStepV3,
  SimulationConfigV3,
  SimulationRuntime,
  SimulationSeriesV3,
  SimulationStepV3,
  TimeRange,
  ValidationIssue,
  ValidationReportV3,
} from "./types";

export { createDefaultSimulationConfigV3, toSimulationConfigV3, toSystemParamsV2 } from "./adapter";
export { createSimulation, sampleRangeSeconds } from "./runtime";
export { assertValidSimulationConfigV3, validateSimulationConfigV3 } from "./validation";
