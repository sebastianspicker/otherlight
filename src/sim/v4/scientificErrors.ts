export type ScientificBrowserFailureStage = "config" | "native-inputs" | "step";

export type ScientificBrowserFailureCode =
  | "SCB_EXCLUDED_SURFACE"
  | "SCB_ADDITIVE_FLUX_INVALID_CONFIG"
  | "SCB_ADDITIVE_FLUX_UNSUPPORTED"
  | "SCB_TRANSMISSION_MODEL_UNSUPPORTED"
  | "SCB_TRANSMISSION_RT_INVALID_INPUTS"
  | "SCB_TRANSMISSION_RT_NO_VALID_LAYERS"
  | "SCB_TRANSMISSION_RT_FEATURE_UNSUPPORTED"
  | "SCB_TRANSMISSION_MIXED_SHAPE"
  | "SCB_INVALID_RELATIVITY_CONFIG"
  | "SCB_INVALID_REFERENCE_SUBSTEPS"
  | "SCB_INVALID_TIMING_REFERENCE"
  | "SCB_INVALID_STELLAR_SURFACE"
  | "SCB_INVALID_NBODY_CONFIG"
  | "SCB_INVALID_LEGACY_ORBIT"
  | "SCB_BINARY_IMPLICIT_PASSBAND"
  | "SCB_BINARY_UNSUPPORTED_PASSBAND"
  | "SCB_BINARY_INVALID_STELLAR_INPUTS"
  | "SCB_BINARY_LIMB_DARKENING_FALLBACK"
  | "SCB_INVALID_ORBIT"
  | "SCB_INVALID_NATIVE_INPUTS"
  | "SCB_BINARY_PHOTOMETRY_FALLBACK"
  | "SCB_STEP_FAILED";

export type ScientificBrowserFailureContext = Record<string, string | number | boolean>;

export class ScientificBrowserRuntimeError extends Error {
  readonly stage: ScientificBrowserFailureStage;
  readonly code: ScientificBrowserFailureCode;
  readonly details: string[];
  readonly context: ScientificBrowserFailureContext;
  readonly cause?: unknown;

  constructor(args: {
    message: string;
    stage: ScientificBrowserFailureStage;
    code: ScientificBrowserFailureCode;
    details?: string[];
    context?: ScientificBrowserFailureContext;
    cause?: unknown;
  }) {
    super(args.message);
    this.name = "ScientificBrowserRuntimeError";
    this.stage = args.stage;
    this.code = args.code;
    this.details = [...(args.details ?? [])];
    this.context = { ...(args.context ?? {}) };
    this.cause = args.cause;
  }
}

export function isScientificBrowserRuntimeError(error: unknown): error is ScientificBrowserRuntimeError {
  return error instanceof ScientificBrowserRuntimeError;
}

export function createScientificBrowserRuntimeError(args: {
  stage: ScientificBrowserFailureStage;
  code: ScientificBrowserFailureCode;
  summary: string;
  details?: string[];
  context?: ScientificBrowserFailureContext;
  cause?: unknown;
}): ScientificBrowserRuntimeError {
  return new ScientificBrowserRuntimeError({
    message: `scientific-browser ${args.stage} failure [${args.code}]: ${args.summary}`,
    stage: args.stage,
    code: args.code,
    details: args.details,
    context: args.context,
    cause: args.cause,
  });
}
