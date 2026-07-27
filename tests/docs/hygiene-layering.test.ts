/** Enforces source-layer import boundaries and related documentation hygiene budgets. */

import path from "node:path";
import { expect, it } from "vitest";
import { readTextFileWithinRepo, walkTsFiles } from "../helpers/walkTsFiles";

/**
 * Architectural boundary tests enforce the module layering:
 *
 *   core/        → imports NOTHING from other src/ modules (type-only from itself OK)
 *   physics/     → imports only from core/
 *   photometry/  → imports only from core/ and physics/
 *   sim/         → imports from core/, physics/, photometry/
 *   didactics/   → imports from core/, sim/, physics/
 *   render/      → imports from core/, physics/, sim/
 *   ui/          → imports from core/, physics/, ui/ (NOT sim/ or render/)
 *   app/         → imports from anything (top-level orchestration)
 *
 * Type-only imports (`import type`) are excluded from violation checks.
 *
 * The app layer owns orchestration. Lower layers stay reusable by depending only
 * on data contracts or hooks, not on browser wiring, renderers, or lesson UI.
 */

/** Collect non-type-only import violations for a layer importing from forbidden modules. */
function findViolations(layerDir: string, forbiddenModules: string[]): string[] {
  const root = process.cwd();
  const layerRoot = path.join(root, "src", layerDir);
  const offenders = walkTsFiles(layerRoot).filter((file) =>
    fileImportsForbiddenModule(file, forbiddenModules),
  );

  return [...new Set(offenders.map((file) => path.relative(root, file)))];
}

function fileImportsForbiddenModule(file: string, forbiddenModules: string[]): boolean {
  return readTextFileWithinRepo(file)
    .split("\n")
    .some((line) => lineImportsForbiddenModule(file, line, forbiddenModules));
}

function lineImportsForbiddenModule(file: string, line: string, forbiddenModules: string[]): boolean {
  const trimmed = line.trim();
  return (
    !isTypeOnlyImport(trimmed) && forbiddenModules.some((mod) => importsForbiddenModule(file, trimmed, mod))
  );
}

function isTypeOnlyImport(line: string): boolean {
  return /^import\s+type\b/.test(line);
}

function importsForbiddenModule(file: string, line: string, mod: string): boolean {
  const marker = " from ";
  const fromIndex = line.indexOf(marker);
  if (fromIndex < 0) return false;

  const specifier = quotedImportSpecifier(line.slice(fromIndex + marker.length));
  if (!specifier) return false;

  const srcModule = importedSrcModule(file, specifier);
  return srcModule === mod;
}

function quotedImportSpecifier(fragment: string): string | undefined {
  const quote = fragment.trimStart()[0];
  if (quote !== '"' && quote !== "'") return undefined;

  const rest = fragment.trimStart().slice(1);
  const end = rest.indexOf(quote);
  return end >= 0 ? rest.slice(0, end) : undefined;
}

function importedSrcModule(file: string, specifier: string): string | undefined {
  const srcRoot = path.join(process.cwd(), "src");

  if (specifier.startsWith(".")) {
    const resolvedImport = path.resolve(path.dirname(file), specifier);
    const relativeToSrc = path.relative(srcRoot, resolvedImport);
    if (relativeToSrc.startsWith("..") || path.isAbsolute(relativeToSrc)) return undefined;
    return relativeToSrc.split(path.sep)[0];
  }

  const segments = specifier.split("/");
  if (segments[0] === "src") return segments[1];
  if (segments[0] === "@") return segments[1];
  return segments[0];
}

// ── core/ imports NOTHING from other src/ modules ──────────────────────
it("core/ does not import from physics/", () => {
  expect(findViolations("core", ["physics"])).toEqual([]);
});

it("core/ does not import from photometry/", () => {
  expect(findViolations("core", ["photometry"])).toEqual([]);
});

it("core/ does not import from sim/", () => {
  expect(findViolations("core", ["sim"])).toEqual([]);
});

it("core/ does not import from didactics/", () => {
  expect(findViolations("core", ["didactics"])).toEqual([]);
});

it("core/ does not import from render/", () => {
  expect(findViolations("core", ["render"])).toEqual([]);
});

it("core/ does not import from ui/", () => {
  expect(findViolations("core", ["ui"])).toEqual([]);
});

it("core/ does not import from app/", () => {
  expect(findViolations("core", ["app"])).toEqual([]);
});

// ── physics/ imports only from core/ ───────────────────────────────────
it("physics/ does not import from photometry/", () => {
  expect(findViolations("physics", ["photometry"])).toEqual([]);
});

it("physics/ does not import from sim/", () => {
  expect(findViolations("physics", ["sim"])).toEqual([]);
});

it("physics/ does not import from didactics/", () => {
  expect(findViolations("physics", ["didactics"])).toEqual([]);
});

it("physics/ does not import from render/", () => {
  expect(findViolations("physics", ["render"])).toEqual([]);
});

it("physics/ does not import from ui/", () => {
  expect(findViolations("physics", ["ui"])).toEqual([]);
});

it("physics/ does not import from app/", () => {
  expect(findViolations("physics", ["app"])).toEqual([]);
});

// ── photometry/ imports only from core/ and physics/ ───────────────────
it("photometry/ does not import from sim/", () => {
  expect(findViolations("photometry", ["sim"])).toEqual([]);
});

it("photometry/ does not import from didactics/", () => {
  expect(findViolations("photometry", ["didactics"])).toEqual([]);
});

it("photometry/ does not import from render/", () => {
  expect(findViolations("photometry", ["render"])).toEqual([]);
});

it("photometry/ does not import from ui/", () => {
  expect(findViolations("photometry", ["ui"])).toEqual([]);
});

it("photometry/ does not import from app/", () => {
  expect(findViolations("photometry", ["app"])).toEqual([]);
});

// ── sim/ imports from core/, physics/, photometry/, config/ ─────────────
it("sim/ does not import from didactics/", () => {
  expect(findViolations("sim", ["didactics"])).toEqual([]);
});

it("sim/ does not import from app/", () => {
  expect(findViolations("sim", ["app"])).toEqual([]);
});

it("sim/ does not import from render/", () => {
  expect(findViolations("sim", ["render"])).toEqual([]);
});

it("sim/ does not import from ui/", () => {
  expect(findViolations("sim", ["ui"])).toEqual([]);
});

// ── didactics/ imports from core/, sim/, physics/ ──────────────────────
it("didactics/ does not import from photometry/", () => {
  expect(findViolations("didactics", ["photometry"])).toEqual([]);
});

it("didactics/ does not import from render/", () => {
  expect(findViolations("didactics", ["render"])).toEqual([]);
});

it("didactics/ does not import from ui/", () => {
  expect(findViolations("didactics", ["ui"])).toEqual([]);
});

it("didactics/ does not import from app/", () => {
  expect(findViolations("didactics", ["app"])).toEqual([]);
});

// ── render/ imports from core/, physics/, sim/ ─────────────────────────
it("render/ does not import from photometry/", () => {
  expect(findViolations("render", ["photometry"])).toEqual([]);
});

it("render/ does not import from didactics/", () => {
  expect(findViolations("render", ["didactics"])).toEqual([]);
});

it("render/ does not import from ui/", () => {
  expect(findViolations("render", ["ui"])).toEqual([]);
});

it("render/ does not import from app/", () => {
  expect(findViolations("render", ["app"])).toEqual([]);
});

// ── ui/ imports from core/, physics/, ui/ ──────────────────────────────
it("ui/ does not import from app/", () => {
  expect(findViolations("ui", ["app"])).toEqual([]);
});

it("ui/ does not import from sim/", () => {
  expect(findViolations("ui", ["sim"])).toEqual([]);
});

it("ui/ does not import from render/", () => {
  expect(findViolations("ui", ["render"])).toEqual([]);
});

it("ui/ does not import from didactics/", () => {
  expect(findViolations("ui", ["didactics"])).toEqual([]);
});

it("ui/ does not import from photometry/", () => {
  expect(findViolations("ui", ["photometry"])).toEqual([]);
});
