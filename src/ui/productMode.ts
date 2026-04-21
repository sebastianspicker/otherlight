import { setHidden } from "../core/dom";

export type ProductMode = "simulation" | "lab";

export function readProductMode(value: string | null | undefined): ProductMode {
  return value === "lab" ? "lab" : "simulation";
}

export function syncProductModeVisibility(mode: ProductMode, root: ParentNode = document): void {
  if (root instanceof Document) root.documentElement.dataset.productMode = mode;

  const modeEls = Array.from(root.querySelectorAll<HTMLElement>("[data-product-mode]"));
  for (const el of modeEls) {
    const modes = (el.dataset.productMode ?? "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    const visible = modes.length === 0 || modes.includes(mode);
    setHidden(el, !visible);
    if (!visible && el instanceof HTMLDetailsElement) el.open = false;
  }
}
