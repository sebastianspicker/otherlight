import { collectScientificBrowserOrbitIssues } from "./scientificBrowserDynamicsConfig";
import { createScientificBrowserRuntimeError, isScientificBrowserRuntimeError } from "./scientificErrors";
import type { SimulationConfigV4 } from "./types";

type DirectV4RuntimeInput = {
  version?: unknown;
  mode?: unknown;
  runtime?: {
    executionMode?: unknown;
    mode?: unknown;
  };
};

function isDirectScientificBrowserV4(input: DirectV4RuntimeInput): boolean {
  return input.version === "4" && input.runtime?.executionMode === "scientific-browser";
}

function scientificBrowserRuntimeMode(input: DirectV4RuntimeInput): "reference" | "realtime" {
  return input.runtime?.mode === "reference" ? "reference" : "realtime";
}

function directV4Mode(input: DirectV4RuntimeInput): string {
  return typeof input.mode === "string" ? input.mode : "";
}

function rethrowInvalidScientificBrowserOrbit(input: DirectV4RuntimeInput, error: unknown): void {
  const orbitIssues = collectScientificBrowserOrbitIssues(input as SimulationConfigV4);
  if (orbitIssues.length === 0) return;

  throw createScientificBrowserRuntimeError({
    stage: "config",
    code: "SCB_INVALID_ORBIT",
    summary: "scientific-browser mode requires semantically valid static orbit elements",
    details: orbitIssues,
    context: {
      executionMode: "scientific-browser",
      runtimeMode: scientificBrowserRuntimeMode(input),
      mode: directV4Mode(input),
    },
    cause: error,
  });
}

export function rethrowScientificBrowserNormalizationFailure(input: unknown, error: unknown): never {
  const directInput = input as DirectV4RuntimeInput;
  if (isDirectScientificBrowserV4(directInput)) {
    try {
      rethrowInvalidScientificBrowserOrbit(directInput, error);
    } catch (scientificError) {
      if (isScientificBrowserRuntimeError(scientificError)) throw scientificError;
    }
  }
  throw error;
}
