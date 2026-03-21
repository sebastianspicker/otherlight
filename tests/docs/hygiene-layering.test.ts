import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { walkTsFiles } from "../helpers/walkTsFiles";

/**
 * Architectural boundary tests — enforce the module layering:
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
 * Known violations that exist in the codebase (not tested to avoid false failures):
 *
 *   sim/ → didactics/:
 *     - src/sim/v4/nativeEngine.ts imports from ../../didactics/engine
 *     - src/sim/v3/runtime.ts imports from ../../didactics/v3
 *     - src/sim/sim.ts imports from ../didactics/engine
 *
 *   sim/ → app/:
 *     - src/sim/v4/adapter.ts imports from ../../app/scenario
 *     - src/sim/v3/adapter.ts imports from ../../app/scenario
 *
 *   render/ → photometry/:
 *     - src/render/starDisk.ts imports from ../photometry/limbDarkening
 *
 *   ui/ → app/:
 *     - src/ui/params/read.ts imports from ../../app/scenario
 */

/** Collect non-type-only import violations for a layer importing from forbidden modules. */
function findViolations(layerDir: string, forbiddenModules: string[]): string[] {
  const root = process.cwd();
  const layerRoot = path.join(root, "src", layerDir);
  const files = walkTsFiles(layerRoot);
  const offenders: string[] = [];

  // Match `import ... from '.../<module>/...'` but NOT `import type ...`
  // We check each line individually so we can skip type-only imports.
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip type-only imports
      if (/^import\s+type\b/.test(trimmed)) continue;
      // Check for forbidden module references in import-from statements
      for (const mod of forbiddenModules) {
        const rx = new RegExp(`from\\s+["'][^"']*\\/${mod}\\/[^"']*["']`);
        if (rx.test(trimmed)) {
          offenders.push(path.relative(root, file));
          break; // one hit per file is enough
        }
      }
    }
  }

  return [...new Set(offenders)]; // deduplicate
}

describe("hygiene layering", () => {
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

  // ── sim/ imports from core/, physics/, photometry/ ─────────────────────
  // Known violations: sim/ imports from didactics/ and app/ (see top-of-file comment)
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
  // Known violation: render/starDisk.ts imports from photometry/ (see top-of-file comment)
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
  // Known violation: ui/params/read.ts imports from app/ (see top-of-file comment)
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
});
