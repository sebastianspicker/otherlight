/**
 * Reads the product profile and syncs its visibility and navigation.
 */
import { syncModeVisibility } from "./modeVisibility";

export type ProductProfile = "education" | "scientific";

export function readProductProfile(value: string | null | undefined): ProductProfile {
  return value === "scientific" ? "scientific" : "education";
}

export function syncProductProfileVisibility(profile: ProductProfile, root: ParentNode = document): void {
  if (root instanceof Document) root.documentElement.dataset.productProfile = profile;

  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-product-profile]"))) {
    syncModeVisibility(el, el.dataset.productProfile ?? "", profile, "product-profile");
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
