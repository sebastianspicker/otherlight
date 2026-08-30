/**
 * Owns labs support within the core layer. Keeps shared domain contracts independent of application and simulation orchestration.
 */
import type { LessonSimMode } from "./typesDidactics";

export type LabSystemId = "transit-exomoon" | "binary-stars";
export type LabControlValue = Exclude<LessonSimMode, "either">;

export type LabSystemDefinition = {
  id: LabSystemId;
  controlValue: LabControlValue;
  label: string;
  description: string;
};

/**
 * Systems available inside the single Guided Labs workspace.
 *
 * `controlValue` is the compatibility seam used by the V4 runtime. Product
 * state and user-facing copy use stable system IDs instead of treating the
 * detached binary as a separate product mode.
 */
export const LAB_SYSTEMS: readonly LabSystemDefinition[] = [
  {
    id: "transit-exomoon",
    controlValue: "preset-lab",
    label: "Planet and exomoon systems",
    description: "Transit geometry, curve reading, stellar surfaces, timing, and exomoon signals.",
  },
  {
    id: "binary-stars",
    controlValue: "binary-lab",
    label: "Binary-star systems",
    description: "Detached eclipsing binaries with combined-light interpretation and an optional sky reveal.",
  },
] as const;

export const DEFAULT_LAB_SYSTEM = LAB_SYSTEMS[0];

export function getLabSystemById(id: string | null | undefined): LabSystemDefinition {
  return LAB_SYSTEMS.find((system) => system.id === id) ?? DEFAULT_LAB_SYSTEM;
}

export function getLabSystemByControlValue(value: string | null | undefined): LabSystemDefinition {
  return LAB_SYSTEMS.find((system) => system.controlValue === value) ?? DEFAULT_LAB_SYSTEM;
}

export function isLabSystemId(value: string): value is LabSystemId {
  return LAB_SYSTEMS.some((system) => system.id === value);
}
