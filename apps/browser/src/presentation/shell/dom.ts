/** Provides small DOM mutation primitives shared by app and UI wiring. */

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
  if ("disabled" in el) (el as HTMLButtonElement).disabled = disabled;
  el.setAttribute("aria-disabled", disabled ? "true" : "false");
}

/** Set a select's value only when the control is present. */
export function setOptionalSelectValue(select: HTMLSelectElement | null, value: string): void {
  if (select) select.value = value;
}
