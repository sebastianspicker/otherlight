/**
 * Chooses the V5 request the Scientific workspace submits and saves: a validated
 * request restored from a workspace document, or one compiled from the active
 * Education scenario and the run form.
 *
 * Invalidation rule: the restored request is used unchanged until the active
 * scenario object is replaced (any scenario apply, reset, preset, real-system,
 * lab, or didactics change) or the user edits any run-form field. The restored
 * `endOffsetSec` is kept exactly until the user edits the duration field, so the
 * hours display never round-trips back into seconds.
 */
import type { BrowserScenarioDraft } from "../../domain/model/types";
import {
  buildScientificForwardRequestFromEducationScenarioV4,
  type ForwardRunRequest,
} from "../../infrastructure/science";
import { toEducationScenarioV4 } from "../../application/browserScenarioAdapter";

export type ScienceRunFormElements = {
  durationHours: HTMLInputElement;
  cadenceSec: HTMLInputElement;
  seed: HTMLInputElement;
};

type ScienceRequestSourceArgs = {
  getSystem: () => BrowserScenarioDraft;
  isBinaryMode: () => boolean;
  signal: AbortSignal;
};

export type ScienceRequestSource = {
  restore: (request: ForwardRunRequest | undefined) => void;
  hasRestoredRequest: () => boolean;
  current: () => ForwardRunRequest;
};

type ScienceRunInputs = {
  endOffsetSec: number;
  cadenceSec: number;
  seed: number;
};

function isInvalidNumber(
  value: number,
  options: { minimum: number; maximum: number; integer?: boolean },
): boolean {
  if (!Number.isFinite(value)) return true;
  if (value < options.minimum) return true;
  if (value > options.maximum) return true;
  return options.integer === true && !Number.isSafeInteger(value);
}

function inputNumber(
  input: HTMLInputElement,
  label: string,
  options: { minimum: number; maximum: number; integer?: boolean },
): number {
  const value = input.valueAsNumber;
  if (isInvalidNumber(value, options)) {
    const kind = options.integer ? "an integer" : "a finite number";
    throw new Error(`${label} must be ${kind} between ${options.minimum} and ${options.maximum}.`);
  }
  return value;
}

/** `exactEndOffsetSec` is an already-validated restored duration that replaces the hours field. */
function readRunInputs(
  elements: ScienceRunFormElements,
  exactEndOffsetSec: number | undefined,
): ScienceRunInputs {
  return {
    endOffsetSec:
      exactEndOffsetSec ??
      inputNumber(elements.durationHours, "Duration", {
        minimum: 0.01,
        maximum: 8_760,
      }) * 3_600,
    cadenceSec: inputNumber(elements.cadenceSec, "Cadence", {
      minimum: 0.001,
      maximum: 31_557_600,
    }),
    seed: inputNumber(elements.seed, "Seed", {
      minimum: Number.MIN_SAFE_INTEGER,
      maximum: Number.MAX_SAFE_INTEGER,
      integer: true,
    }),
  };
}

export function createScienceRequestSource(
  args: ScienceRequestSourceArgs,
  elements: ScienceRunFormElements,
): ScienceRequestSource {
  let restored: { request: ForwardRunRequest; system: BrowserScenarioDraft } | undefined;
  let exactEndOffsetSec: number | undefined;

  const listenerOptions: AddEventListenerOptions = { signal: args.signal };
  const discardRestored = (): void => {
    restored = undefined;
  };
  for (const input of [elements.durationHours, elements.cadenceSec, elements.seed]) {
    input.addEventListener("input", discardRestored, listenerOptions);
    input.addEventListener("change", discardRestored, listenerOptions);
  }
  const discardExactDuration = (): void => {
    exactEndOffsetSec = undefined;
  };
  elements.durationHours.addEventListener("input", discardExactDuration, listenerOptions);
  elements.durationHours.addEventListener("change", discardExactDuration, listenerOptions);

  const validRestored = (): ForwardRunRequest | undefined => {
    if (restored && restored.system !== args.getSystem()) restored = undefined;
    return restored?.request;
  };

  const compile = (): ForwardRunRequest => {
    const { endOffsetSec, cadenceSec, seed } = readRunInputs(elements, exactEndOffsetSec);
    return buildScientificForwardRequestFromEducationScenarioV4({
      scenario: toEducationScenarioV4({
        system: args.getSystem(),
        binaryMode: args.isBinaryMode(),
        runtimeMode: "reference",
        executionMode: "scientific-browser",
      }),
      startOffsetSec: 0,
      endOffsetSec,
      sampleCadenceSec: cadenceSec,
      seed,
    });
  };

  return {
    restore: (request) => {
      restored = request ? { request, system: args.getSystem() } : undefined;
      exactEndOffsetSec = request?.endOffsetSec;
    },
    hasRestoredRequest: () => validRestored() !== undefined,
    current: () => validRestored() ?? compile(),
  };
}
