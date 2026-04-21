/**
 * V3 type and migration surface.
 *
 * The V3 runtime factory functions (createSimulation, sampleRangeSeconds) have been retired.
 * Use the V4 engine (src/sim/v4) for all new code.
 *
 * NOTE: V3 types (SimulationStepV3, RenderSignalsV3, etc.) are the active render/step
 * protocol types used throughout the application and are NOT deprecated.
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
export { assertValidSimulationConfigV3, validateSimulationConfigV3 } from "./validation";
