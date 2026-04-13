import type { LessonSpec } from "../core/types";
import { PRESET_LESSONS } from "./lessonsPresetCatalog";
import { BINARY_LESSONS } from "./lessonsBinaryCatalog";

export const LESSONS: LessonSpec[] = [...PRESET_LESSONS, ...BINARY_LESSONS];
