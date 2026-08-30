/**
 * Owns product Mode support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import { syncModeVisibility } from "./modeVisibility";

export type ProductMode = "simulation" | "lab";

export function readProductMode(value: string | null | undefined): ProductMode {
  return value === "lab" ? "lab" : "simulation";
}

export function syncProductModeVisibility(mode: ProductMode, root: ParentNode = document): void {
  if (root instanceof Document) root.documentElement.dataset.productMode = mode;

  const modeEls = Array.from(root.querySelectorAll<HTMLElement>("[data-product-mode]"));
  for (const el of modeEls) {
    syncModeVisibility(el, el.dataset.productMode ?? "", mode);
  }
}
