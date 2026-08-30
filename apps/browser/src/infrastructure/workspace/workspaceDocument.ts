/** Strict, portable browser workspace document contract. */
import type { DidacticResponseStore, LearningState, BrowserScenarioDraft } from "../../domain/model/types";
import { isLabSystemId } from "../../domain/model/labs";
import type { BinaryLabHypothesis, BinaryLabState } from "../../domain/education/binaryLab";
import { assertScienceJobRequest } from "../science/validation";
import type { ForwardRunRequest } from "../science/types";
import {
  normalizeEducationScenarioV4Input,
  toBrowserScenarioDraftFromEducationScenarioV4,
  type EducationScenarioV4,
} from "../../domain/simulation/v4";
import { isStableProductViewId, type ProductViewState } from "../../application/productViewState";
import { SCENARIO_DEFAULTS } from "../../application/catalog/defaults";

export const WORKSPACE_SCHEMA_VERSION = "workspace-v1" as const;

export type GuidedLabWorkspaceState = {
  learning: Pick<LearningState, "lessonId" | "stepIndex" | "phaseIndex" | "passedStepIds" | "lastScore">;
  responses: Record<string, Pick<DidacticResponseStore[string], "primary" | "secondary">>;
  hintLevel: "L1" | "L2" | "L3";
  binaryLab?: Pick<BinaryLabState, "revealed" | "hypothesis">;
};

export type WorkspaceDocumentV1 = {
  schemaVersion: typeof WORKSPACE_SCHEMA_VERSION;
  productContext: ProductViewState;
  education: { scenario: EducationScenarioV4; guidedLab?: GuidedLabWorkspaceState };
  scientific?: { request: ForwardRunRequest };
};

const PRODUCT_KEYS = ["profile", "mode", "ui", "source", "scenario", "lab", "lesson", "runtime"] as const;
const HYPOTHESES: readonly BinaryLabHypothesis[] = [
  "primary-eclipse-deepest",
  "secondary-eclipse-dominates",
  "eccentricity-shifts-eclipse-spacing",
];

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fail = (path: string, expectation: string): never => {
  throw new Error(`${path} must be ${expectation}.`);
};

const record = (value: unknown, path: string): UnknownRecord => {
  if (!isRecord(value)) return fail(path, "an object");
  return value;
};

const exactKeys = (value: UnknownRecord, path: string, keys: readonly string[]): void => {
  const actual = Object.keys(value);
  for (const key of actual) if (!keys.includes(key)) fail(`${path}.${key}`, "supported");
  for (const key of keys) if (!(key in value)) fail(`${path}.${key}`, "present");
};

const optionalExactKeys = (
  value: UnknownRecord,
  path: string,
  keys: readonly string[],
  required: readonly string[],
): void => {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, "supported");
  for (const key of required) if (!(key in value)) fail(`${path}.${key}`, "present");
};

const readString = (value: unknown, path: string): string => {
  if (typeof value !== "string" || value.length === 0) return fail(path, "a non-empty string");
  return value;
};

const readChoice = <T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  expectation: string,
): T => {
  const text = readString(value, path);
  if (!allowed.includes(text as T)) fail(path, expectation);
  return text as T;
};

const boundedText = (value: unknown, path: string): string => {
  if (typeof value !== "string" || value.length > 20_000)
    return fail(path, "a string of at most 20000 characters");
  return value;
};

const nonNegativeInteger = (value: unknown, path: string): number => {
  if (!Number.isInteger(value) || (value as number) < 0) fail(path, "a non-negative integer");
  return value as number;
};

const finiteNumber = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fail(path, "a finite number");
  return value;
};

const parseProductContext = (value: unknown): ProductViewState => {
  const context = record(value, "productContext");
  exactKeys(context, "productContext", PRODUCT_KEYS);
  const profile = readChoice(
    context.profile,
    "productContext.profile",
    ["education", "scientific"],
    '"education" or "scientific"',
  );
  const mode = readChoice(
    context.mode,
    "productContext.mode",
    ["simulation", "lab"],
    '"simulation" or "lab"',
  );
  const ui = readChoice(
    context.ui,
    "productContext.ui",
    ["essential", "advanced"],
    '"essential" or "advanced"',
  );
  const source = readChoice(
    context.source,
    "productContext.source",
    ["preset", "real"],
    '"preset" or "real"',
  );
  const scenario = readString(context.scenario, "productContext.scenario");
  const lab = readString(context.lab, "productContext.lab");
  const lesson = readString(context.lesson, "productContext.lesson");
  const runtime = readChoice(
    context.runtime,
    "productContext.runtime",
    ["interactive", "reference"],
    '"interactive" or "reference"',
  );
  if (!isStableProductViewId(scenario)) return fail("productContext.scenario", "a stable ID");
  if (!isLabSystemId(lab)) return fail("productContext.lab", "a known lab ID");
  if (!isStableProductViewId(lesson)) return fail("productContext.lesson", "a stable ID");
  return { profile, mode, ui, source, scenario, lab, lesson, runtime };
};

const parsePassedStepIds = (value: unknown): string[] => {
  const passedStepIds = Array.isArray(value)
    ? value
    : fail("education.guidedLab.learning.passedStepIds", "an array");
  const passed = passedStepIds.map((entry, index) => {
    const path = `education.guidedLab.learning.passedStepIds[${index}]`;
    const id = readString(entry, path);
    if (!isStableProductViewId(id)) fail(path, "a stable ID");
    return id;
  });
  if (new Set(passed).size !== passed.length) fail("education.guidedLab.learning.passedStepIds", "unique");
  return passed;
};

const parseGuidedLearning = (value: unknown) => {
  const learning = record(value, "education.guidedLab.learning");
  optionalExactKeys(
    learning,
    "education.guidedLab.learning",
    ["lessonId", "stepIndex", "phaseIndex", "passedStepIds", "lastScore"],
    ["lessonId", "stepIndex", "passedStepIds"],
  );
  const lessonId = readString(learning.lessonId, "education.guidedLab.learning.lessonId");
  if (!isStableProductViewId(lessonId)) fail("education.guidedLab.learning.lessonId", "a stable ID");
  const stepIndex = nonNegativeInteger(learning.stepIndex, "education.guidedLab.learning.stepIndex");
  const passedStepIds = parsePassedStepIds(learning.passedStepIds);
  const parsedLearning: GuidedLabWorkspaceState["learning"] = {
    lessonId,
    stepIndex,
    passedStepIds,
  };
  if (learning.phaseIndex !== undefined)
    parsedLearning.phaseIndex = nonNegativeInteger(
      learning.phaseIndex,
      "education.guidedLab.learning.phaseIndex",
    );
  if (learning.lastScore !== undefined)
    parsedLearning.lastScore = finiteNumber(learning.lastScore, "education.guidedLab.learning.lastScore");
  if ((parsedLearning.lastScore ?? 0) < 0) fail("education.guidedLab.learning.lastScore", "non-negative");
  return parsedLearning;
};

const parseGuidedResponses = (value: unknown) => {
  const responseValues = record(value, "education.guidedLab.responses");
  const responses = Object.create(null) as GuidedLabWorkspaceState["responses"];
  for (const [key, value] of Object.entries(responseValues)) {
    if (key.length === 0 || key.length > 512)
      fail(`education.guidedLab.responses.${key}`, "a bounded response key");
    const entry = record(value, `education.guidedLab.responses.${key}`);
    optionalExactKeys(entry, `education.guidedLab.responses.${key}`, ["primary", "secondary"], []);
    const response: { primary?: string; secondary?: string } = {};
    if (entry.primary !== undefined)
      response.primary = boundedText(entry.primary, `education.guidedLab.responses.${key}.primary`);
    if (entry.secondary !== undefined)
      response.secondary = boundedText(entry.secondary, `education.guidedLab.responses.${key}.secondary`);
    responses[key] = response;
  }
  return responses;
};

const parseHintLevel = (value: unknown) => {
  const hintLevel = readString(value, "education.guidedLab.hintLevel");
  if (hintLevel !== "L1" && hintLevel !== "L2" && hintLevel !== "L3")
    return fail("education.guidedLab.hintLevel", '"L1", "L2", or "L3"');
  return hintLevel;
};

const parseBinaryLab = (value: unknown) => {
  const binaryLab = record(value, "education.guidedLab.binaryLab");
  optionalExactKeys(binaryLab, "education.guidedLab.binaryLab", ["revealed", "hypothesis"], ["revealed"]);
  if (typeof binaryLab.revealed !== "boolean")
    return fail("education.guidedLab.binaryLab.revealed", "a boolean");
  const restored: NonNullable<GuidedLabWorkspaceState["binaryLab"]> = { revealed: binaryLab.revealed };
  if (binaryLab.hypothesis !== undefined) {
    const hypothesis = readString(binaryLab.hypothesis, "education.guidedLab.binaryLab.hypothesis");
    if (!HYPOTHESES.includes(hypothesis as BinaryLabHypothesis))
      fail("education.guidedLab.binaryLab.hypothesis", "a supported hypothesis");
    restored.hypothesis = hypothesis as BinaryLabHypothesis;
  }
  return restored;
};

const parseGuidedLab = (value: unknown): GuidedLabWorkspaceState => {
  const guided = record(value, "education.guidedLab");
  optionalExactKeys(
    guided,
    "education.guidedLab",
    ["learning", "responses", "hintLevel", "binaryLab"],
    ["learning", "responses", "hintLevel"],
  );
  const learning = parseGuidedLearning(guided.learning);
  const responses = parseGuidedResponses(guided.responses);
  const hintLevel = parseHintLevel(guided.hintLevel);
  const out: GuidedLabWorkspaceState = {
    learning,
    responses,
    hintLevel,
  };
  if (guided.binaryLab !== undefined) out.binaryLab = parseBinaryLab(guided.binaryLab);
  return out;
};

function parseScenario(value: unknown): EducationScenarioV4 {
  const candidate = record(value, "education.scenario");
  if (candidate.version !== "4") fail("education.scenario.version", '"4"');
  try {
    return normalizeEducationScenarioV4Input(candidate);
  } catch (error) {
    throw new Error(
      `education.scenario is not a valid V4 configuration: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** Parses an untrusted .otherlight or legacy .transitlab JSON document without mutating state. */
export function parseWorkspaceDocument(value: unknown): WorkspaceDocumentV1 {
  const document = record(value, "workspace");
  optionalExactKeys(
    document,
    "workspace",
    ["schemaVersion", "productContext", "education", "scientific"],
    ["schemaVersion", "productContext", "education"],
  );
  if (document.schemaVersion !== WORKSPACE_SCHEMA_VERSION)
    fail("workspace.schemaVersion", `"${WORKSPACE_SCHEMA_VERSION}"`);
  const education = record(document.education, "education");
  optionalExactKeys(education, "education", ["scenario", "guidedLab"], ["scenario"]);
  const parsed: WorkspaceDocumentV1 = {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    productContext: parseProductContext(document.productContext),
    education: { scenario: parseScenario(education.scenario) },
  };
  if (education.guidedLab !== undefined) parsed.education.guidedLab = parseGuidedLab(education.guidedLab);
  if (document.scientific !== undefined) {
    const scientific = record(document.scientific, "scientific");
    exactKeys(scientific, "scientific", ["request"]);
    try {
      assertScienceJobRequest(scientific.request);
    } catch (error) {
      throw new Error(
        `scientific.request is invalid: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    if ((scientific.request as { kind?: unknown }).kind !== "forward")
      fail("scientific.request.kind", '"forward"');
    parsed.scientific = { request: scientific.request as ForwardRunRequest };
  }
  if ((parsed.productContext.profile === "scientific") !== (parsed.scientific !== undefined)) {
    fail("workspace.scientific", 'present exactly when productContext.profile is "scientific"');
  }
  return parsed;
}

export function parseWorkspaceDocumentJson(json: string): WorkspaceDocumentV1 {
  try {
    return parseWorkspaceDocument(JSON.parse(json) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error(`Workspace file is not valid JSON: ${error.message}`, { cause: error });
    throw error;
  }
}

/** Returns only the durable learning values; transient timing and assessment output are deliberately excluded. */
export function workspaceGuidedLabState(args: {
  learning: LearningState;
  responses: DidacticResponseStore;
  hintLevel: "L1" | "L2" | "L3";
  binaryLab: BinaryLabState;
}): GuidedLabWorkspaceState {
  const responses = Object.create(null) as GuidedLabWorkspaceState["responses"];
  for (const [key, response] of Object.entries(args.responses)) {
    const persisted: { primary?: string; secondary?: string } = {};
    if (response.primary !== undefined) persisted.primary = response.primary;
    if (response.secondary !== undefined) persisted.secondary = response.secondary;
    responses[key] = persisted;
  }
  return {
    learning: {
      lessonId: args.learning.lessonId,
      stepIndex: args.learning.stepIndex,
      ...(args.learning.phaseIndex === undefined ? {} : { phaseIndex: args.learning.phaseIndex }),
      passedStepIds: [...args.learning.passedStepIds],
      ...(args.learning.lastScore === undefined ? {} : { lastScore: args.learning.lastScore }),
    },
    responses,
    hintLevel: args.hintLevel,
    binaryLab: {
      revealed: args.binaryLab.revealed,
      ...(args.binaryLab.hypothesis === undefined ? {} : { hypothesis: args.binaryLab.hypothesis }),
    },
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

/** Deterministic JSON suitable for browser downloads and version-control fixtures. */
export function encodeWorkspaceDocument(document: WorkspaceDocumentV1): string {
  return `${JSON.stringify(canonicalize(document), null, 2)}\n`;
}

export function restoreWorkspaceScenario(document: WorkspaceDocumentV1): BrowserScenarioDraft {
  // This is the explicit V4 workspace-to-draft restore boundary. Callers receive
  // editable form state only after V4 schema validation has succeeded.
  return toBrowserScenarioDraftFromEducationScenarioV4(document.education.scenario, SCENARIO_DEFAULTS);
}
