/**
 * Owns scenario Control Ranges support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import scenarioJson from "../config/scenario.default.json";

export type ScenarioNumericControlRange = {
  min: number;
  max: number;
  step: number;
};

type ScenarioControl = {
  id?: unknown;
  ui?: {
    kind?: unknown;
    min?: unknown;
    max?: unknown;
    step?: unknown;
  };
};

const scenarioControls = (
  (scenarioJson as { ui?: { controls?: ScenarioControl[] } }).ui?.controls ?? []
).flatMap((control) => {
  const { id, ui } = control;
  if (typeof id !== "string" || ui?.kind !== "slider") return [];
  const { min, max, step } = ui;
  if (
    typeof min !== "number" ||
    !Number.isFinite(min) ||
    typeof max !== "number" ||
    !Number.isFinite(max) ||
    !(max > min) ||
    typeof step !== "number" ||
    !Number.isFinite(step) ||
    !(step > 0)
  ) {
    return [];
  }
  return [[id, { min, max, step }] as const];
});

const normalRangesById = new Map<string, ScenarioNumericControlRange>(scenarioControls);

/** Normal-mode bounds from the bundled scenario control metadata. */
export function scenarioNormalRange(id: string): ScenarioNumericControlRange | undefined {
  return normalRangesById.get(id);
}

/** Apply normal-mode metadata to every matching numeric control in a parameter form. */
export function applyScenarioNormalRanges(form: ParentNode = document): void {
  for (const input of form.querySelectorAll<HTMLInputElement>("input[type='number']")) {
    const range = scenarioNormalRange(input.id);
    if (!range) continue;
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = String(range.step);
  }
}
