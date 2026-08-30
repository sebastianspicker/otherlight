/**
 * Owns lessons Catalog support within the didactics layer. Keeps learning-flow behavior independent of simulation execution.
 */
import type { LessonSpec } from "../model/types";
import { PRESET_LESSONS } from "./lessonsPresetCatalog";
import { BINARY_LESSONS } from "./lessonsBinaryCatalog";

export const LESSONS: LessonSpec[] = [...PRESET_LESSONS, ...BINARY_LESSONS];
