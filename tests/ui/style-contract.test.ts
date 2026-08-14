/** Verifies Quiet Observatory style contract: hybrid tokens, responsive cascade, a11y. */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readOptional(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function loadQuietObservatoryCss(): string {
  const qoDir = join(root, "src/styles/quiet-observatory");
  if (!existsSync(qoDir)) {
    return "";
  }
  return readdirSync(qoDir)
    .filter((n) => n.endsWith(".css"))
    .map((name) => readFileSync(join(qoDir, name), "utf8"))
    .join("\n");
}

/** Reads the public-alpha import hub with its local structural modules. */
function loadPublicAlphaCss(): string {
  const hub = readOptional(join(root, "src/styles/public-alpha.css"));
  const moduleDir = join(root, "src/styles/public-alpha");
  if (!existsSync(moduleDir)) return hub;
  return [
    hub,
    ...[
      "foundations.css",
      "header-context.css",
      "workspace.css",
      "figures-controls.css",
      "responsive.css",
      "dark-theme.css",
    ].map((name) => readFileSync(join(moduleDir, name), "utf8")),
  ].join("\n");
}

/** Structural cascade + final instrument + Quiet Observatory modules. */
function loadStyleCascade(): string {
  const core = [
    "src/style.css",
    "src/styles/base.css",
    "src/styles/shell.css",
    "src/styles/features.css",
    "src/styles/public-alpha.css",
    "src/styles/otherlight-instrument.css",
  ].map((rel) => readOptional(join(root, rel)));

  return [...core, loadQuietObservatoryCss()].join("\n");
}

/** Final hybrid surface layers (instrument hub + quiet-observatory + public-alpha). */
function loadInstrumentAndQuietCss(): string {
  return [
    readOptional(join(root, "src/styles/otherlight-instrument.css")),
    loadQuietObservatoryCss(),
    readOptional(join(root, "src/styles/public-alpha.css")),
  ].join("\n");
}

describe("Quiet Observatory design system registry", () => {
  it("names Quiet Observatory with hybrid theme and mockup-aligned tokens", () => {
    const design = JSON.parse(
      readFileSync(join(root, "docs/design/quiet-observatory.tokens.json"), "utf8"),
    ) as {
      name: string;
      theme: string;
      colors: Record<string, string>;
    };

    expect(design.name).toBe("Quiet Observatory");
    expect(design.theme).toMatch(/ink|lab|plot/i);
    expect(design.colors.ink ?? design.colors.observatoryInk).toBe("#081923");
    expect(design.colors.shell).toBe("#eef3f4");
    expect(design.colors.action).toBe("#087f73");
    expect(design.colors.signal).toBe("#c48a1f");
    expect(design.colors.plot).toBe("#09151d");
    expect(design.colors.world).toBe("#315fba");
  });
});

describe("style cascade responsive contract", () => {
  it("defines small-screen rules that let labels wrap and controls shrink", () => {
    const css = loadStyleCascade();

    // Mobile / tablet breakpoints somewhere in the cascade (features, shell, instrument, or QO).
    expect(css).toMatch(/@media\s*\(\s*max-width:\s*(420|680|760|767|980)px\s*\)/);
    expect(css).toContain("white-space: normal");
    expect(css).toContain("min-width: 0");

    // Historical header selector shrink (features) and/or instrument/command runtime fields.
    const hasLegacyHeaderSelect =
      css.includes(".app-header > div.help > label.inline") && css.includes("width: 100%");
    const hasInstrumentRuntimeShrink =
      css.includes(".runtime-fields") ||
      css.includes(".command") ||
      css.includes("grid-template-columns: 1fr");
    expect(hasLegacyHeaderSelect || hasInstrumentRuntimeShrink).toBe(true);
  });
});

describe("Quiet Observatory hybrid surface markers", () => {
  it("exposes hybrid identity / shell / action / plot markers in final layers", () => {
    const css = loadInstrumentAndQuietCss();
    const qo = loadQuietObservatoryCss();

    // When quiet-observatory modules land, require mockup-aligned hybrid tokens there.
    if (qo.length > 0) {
      expect(qo).toContain("#081923");
      expect(qo).toContain("#eef3f4");
      expect(qo).toContain("#087f73");
      expect(qo).toContain("#c48a1f");
      expect(qo).toContain("#09151d");
      expect(qo).toMatch(/--shell|--ink|--action|--plot/);
      expect(qo).toMatch(/color-scheme:\s*light/);
    }

    // Cascade always carries ink identity + action teal + dark plot evidence.
    expect(css).toContain("#081923");
    expect(css).toMatch(/#087f73|#25b7a5/);
    const hasDarkPlots =
      css.includes("#09151d") ||
      css.includes("--plot") ||
      css.includes("#071116") ||
      css.includes("--instrument-bg");
    expect(hasDarkPlots).toBe(true);
  });

  it("does not require full-dark-only public chrome as the product default", () => {
    const publicAlpha = loadPublicAlphaCss();
    const design = JSON.parse(
      readFileSync(join(root, "docs/design/quiet-observatory.tokens.json"), "utf8"),
    ) as {
      name: string;
    };

    expect(design.name).toBe("Quiet Observatory");
    // Light chrome is intentional; system dark may still exist as a soft override.
    expect(publicAlpha).toMatch(/color-scheme:\s*light/);
    expect(publicAlpha).toContain("#081923");
    // No product theme toggle control in the style layers.
    expect(publicAlpha.includes("theme-toggle") || publicAlpha.includes("data-theme-toggle")).toBe(false);
  });
});

describe("style accessibility contract", () => {
  it("keeps reduced motion, focus, and coarse-pointer affordances in the cascade", () => {
    const css = loadStyleCascade();

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(/outline:\s*3px|outline:\s*2px solid Highlight/);
    expect(css).toMatch(/:focus-visible|forced-colors/);
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("min-height: 44px");
  });
});
