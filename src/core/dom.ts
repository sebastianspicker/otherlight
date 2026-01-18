// src/core/dom.ts

//
// Small DOM helpers intended for the UI layer.
//
// Goals:
// - Fail fast when index.html does not match expected ids (useful during refactors).
// - Provide strongly typed element access in TypeScript.
// - Keep helpers dependency-free (no imports), so they can be used anywhere in UI code.

export type MustGetOptions = {
  /**
   * Optional description used in error messages to speed up debugging when multiple documents
   * or shadow roots are involved.
   */
  scopeName?: string;

  /**
   * Optional parent scope to search within. Defaults to `document`.
   * Typical use: mustGet("myInput", { root: panelEl })
   */
  root?: Document | DocumentFragment | HTMLElement;
};

/**
 * Retrieve an element by id and throw a descriptive error if it is missing.
 *
 * This function only checks that the element exists; it does not validate the element subtype.
 * If you want subtype validation, use mustGetAs().
 */
export function mustGet<T extends Element = HTMLElement>(
  id: string,
  opts: MustGetOptions = {}
): T {
  const root = opts.root ?? document;

  // Document has getElementById; DocumentFragment/HTMLElement don't, so use querySelector there.
  const el: Element | null =
    root instanceof Document
      ? root.getElementById(id)
      : root.querySelector?.(cssEscapeId(id)) ?? null;

  if (!el) {
    const scope = opts.scopeName ? ` in ${opts.scopeName}` : "";
    throw new Error(`Missing element #${id}${scope}.`);
  }

  return el as T;
}

/**
 * Retrieve an element by id and verify it is an instance of the provided constructor.
 *
 * Usage:
 * const skyCanvas = mustGetAs("skyCanvas", HTMLCanvasElement);
 * const speed = mustGetAs("timeSpeed", HTMLInputElement);
 */
export function mustGetAs<T extends Element>(
  id: string,
  ctor: { new (...args: any[]): T },
  opts: MustGetOptions = {}
): T {
  const el = mustGet(id, opts);

  if (!(el instanceof ctor)) {
    const scope = opts.scopeName ? ` in ${opts.scopeName}` : "";
    const want = ctor.name || "Element";
    const got = (el as any)?.constructor?.name || typeof el;
    throw new Error(
      `Element #${id}${scope} has wrong type: expected ${want}, got ${got}.`
    );
  }

  return el as T;
}

/**
 * Like querySelector, but throws if missing.
 *
 * Prefer mustGet() for ids; use mustQuery() for class selectors or more complex selectors.
 */
export function mustQuery<T extends Element = HTMLElement>(
  selector: string,
  root: Document | DocumentFragment | HTMLElement = document
): T {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Missing element for selector: ${selector}`);
  return el as T;
}

/** Set textContent (safe against HTML injection). */
export function setText(el: HTMLElement, text: string): void {
  el.textContent = text;
}

/** Set element visibility via `hidden` attribute (keeps layout predictable). */
export function setHidden(el: HTMLElement, hidden: boolean): void {
  el.hidden = hidden;
}

/**
 * Enable/disable a form control and set aria-disabled consistently.
 */
export function setDisabled(el: HTMLElement, disabled: boolean): void {
  // Many elements have .disabled, but not all HTMLElements do.
  // Use a runtime guard to avoid TypeScript over-generalization.
  if ("disabled" in (el as any)) (el as any).disabled = disabled;
  el.setAttribute("aria-disabled", disabled ? "true" : "false");
}

/**
 * Robust id escaping for querySelector fallback paths.
 *
 * Fix-Option A:
 * - cssEscapeId() returns a complete "#..." selector (not just an escaped identifier).
 * - Callers must NOT add "#" themselves.
 *
 * Uses CSS.escape if available, otherwise a conservative escape.
 *
 * NOTE: The fallback is intentionally conservative (not a full CSS escaping implementation),
 * but it is sufficient for typical ids used in this project.
 */
function cssEscapeId(id: string): string {
  const esc = (globalThis as any).CSS?.escape as
    | ((s: string) => string)
    | undefined;

  if (typeof esc === "function") return `#${esc(id)}`;

  // Conservative escape: backslash-escape characters that commonly break selectors.
  // Also escape leading digits and a leading hyphen-digit pattern (CSS identifier rules).
  const base = id.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");

  // If first char is a digit, escape it using the "\3 " form.
  if (/^\d/.test(base)) {
    return `#\\3${base[0]} ${base.slice(1)}`;
  }

  // If it starts with "-", escape the hyphen to keep it an identifier start.
  if (/^-\d/.test(base)) {
    return `#\\-${base.slice(1)}`;
  }

  return `#${base}`;
}

/**
 * Runtime verification helper for the selector-escape fallback path in the *current* browser.
 *
 * Call this once from app init (or manually from DevTools) to verify that ids with special
 * characters can be resolved via querySelector using cssEscapeId().
 *
 * Returns true when the test passes; throws an Error on failure.
 */
export function verifyCssEscapeInThisBrowser(): boolean {
  const root = document.createElement("div");
  const child = document.createElement("div");

  // Contains characters that need escaping in a CSS id selector.
  const trickyId = `a:b.c[d]#e f\\g"hi'j(k)`;
  child.id = trickyId;

  root.appendChild(child);
  document.body.appendChild(root);

  try {
    const sel = cssEscapeId(trickyId);
    const found = root.querySelector(sel);

    if (found !== child) {
      throw new Error(`cssEscapeId verification failed for selector: ${sel}`);
    }
    return true;
  } finally {
    root.remove();
  }
}
