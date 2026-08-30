/**
 * Owns lessons support within the didactics layer. Keeps learning-flow behavior independent of simulation execution.
 */
import type {
  LessonEventTarget,
  LessonFamily,
  LessonFocusControl,
  LessonPhaseSpec,
  LessonSimMode,
  LessonSpec,
} from "../model/types";
import { LESSONS } from "./lessonsCatalog";
export { LESSONS } from "./lessonsCatalog";

export const LESSON_FOCUS_CONTROL_LABELS: Record<LessonFocusControl, string> = {
  quickPlanetR: "Planet size",
  quickPlanetInc: "Planet inclination",
  quickPlanetA: "Planet orbit size",
  quickMoonEnabled: "Show moon",
  quickMoonR: "Moon size",
  quickMoonA: "Moon spacing",
  quickMoonInc: "Moon inclination",
  quickReflectedLight: "Show reflected light",
};

export const LESSON_EVENT_TARGET_LABELS: Record<LessonEventTarget, string> = {
  planetIngress: "Planet ingress",
  planetMidTransit: "Planet mid-transit",
  planetEgress: "Planet egress",
  moonIngress: "Moon ingress",
  moonMidTransit: "Moon mid-transit",
  moonEgress: "Moon egress",
};

export const LESSON_FAMILY_LABELS: Record<LessonFamily, string> = {
  "transit-geometry": "Transit Geometry",
  "exomoon-signal": "Exomoon Signal",
  "binary-inference": "Binary Inference",
  "curve-reading": "Reading the Curve",
  "stellar-surface": "Stellar Surface",
  "dynamical-inference": "Dynamical Inference",
};

export const DEFAULT_LESSON_ID = LESSONS[0].id;
const LESSON_BY_ID = new Map(LESSONS.map((lesson) => [lesson.id, lesson] as const));
const LESSONS_BY_SIM_MODE: Record<LessonSimMode, LessonSpec[]> = {
  "preset-lab": LESSONS.filter((lesson) => lesson.simMode === "either" || lesson.simMode === "preset-lab"),
  "binary-lab": LESSONS.filter((lesson) => lesson.simMode === "either" || lesson.simMode === "binary-lab"),
  either: LESSONS,
};

export function getLessonById(id: string | undefined): LessonSpec | undefined {
  if (!id) return LESSONS[0];
  return LESSON_BY_ID.get(id);
}

export function getLessonsForSimMode(mode: LessonSimMode): LessonSpec[] {
  return LESSONS_BY_SIM_MODE[mode];
}

export function getDefaultLessonIdForSimMode(mode: LessonSimMode): string {
  return getLessonsForSimMode(mode)[0]?.id ?? DEFAULT_LESSON_ID;
}

export function getLessonStepPhases(lesson: LessonSpec, stepIndex: number): LessonPhaseSpec[] {
  const safeIndex = Math.max(0, Math.min(stepIndex, Math.max(lesson.steps.length - 1, 0)));
  const step = lesson.steps[safeIndex];
  if (Array.isArray(step.phases) && step.phases.length > 0) return step.phases;
  return [
    {
      id: `${step.id}-observe`,
      type: "observe",
      title: step.title,
      prompt: step.prompt,
      responseMode: "observation-notes",
    },
  ];
}
