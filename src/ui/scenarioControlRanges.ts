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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function scenarioNumericRange(
  min: unknown,
  max: unknown,
  step: unknown,
): ScenarioNumericControlRange | undefined {
  if (!isFiniteNumber(min)) return undefined;
  if (!isFiniteNumber(max)) return undefined;
  if (!isFiniteNumber(step)) return undefined;
  if (!(max > min && step > 0)) return undefined;
  return { min, max, step };
}

function scenarioControlRangeEntry(
  control: ScenarioControl,
): readonly [string, ScenarioNumericControlRange] | undefined {
  const { id, ui } = control;
  if (typeof id !== "string" || ui?.kind !== "slider") return undefined;
  const { min, max, step } = ui;
  const range = scenarioNumericRange(min, max, step);
  return range ? [id, range] : undefined;
}

const scenarioControls = ((scenarioJson as { ui?: { controls?: ScenarioControl[] } }).ui?.controls ?? [])
  .map(scenarioControlRangeEntry)
  .filter((entry): entry is readonly [string, ScenarioNumericControlRange] => entry !== undefined);

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
