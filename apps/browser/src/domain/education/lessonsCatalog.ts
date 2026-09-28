/**
 * Defines the main Education lesson catalog.
 */
import type { LessonSpec } from "../model/types";
import { PRESET_LESSONS } from "./lessonsPresetCatalog";
import { BINARY_LESSONS } from "./lessonsBinaryCatalog";

export const LESSONS: LessonSpec[] = [...PRESET_LESSONS, ...BINARY_LESSONS];
