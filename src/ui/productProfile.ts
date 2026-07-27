/**
 * Owns product Profile support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import { setHidden } from "../core/dom";

export type ProductProfile = "education" | "scientific";

export function readProductProfile(value: string | null | undefined): ProductProfile {
  return value === "scientific" ? "scientific" : "education";
}

export function syncProductProfileVisibility(profile: ProductProfile, root: ParentNode = document): void {
  if (root instanceof Document) root.documentElement.dataset.productProfile = profile;

  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-product-profile]"))) {
    const profiles = (el.dataset.productProfile ?? "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    const visible = profiles.length === 0 || profiles.includes(profile);
    setHidden(el, !visible);
    if (!visible && el instanceof HTMLDetailsElement) el.open = false;
  }
}

export function syncProductProfileNavigation(
  select: HTMLSelectElement,
  educationButton: HTMLButtonElement | null,
  scientificButton: HTMLButtonElement | null,
): void {
  const profile = readProductProfile(select.value);
  educationButton?.setAttribute("aria-current", profile === "education" ? "page" : "false");
  scientificButton?.setAttribute("aria-current", profile === "scientific" ? "page" : "false");
}
