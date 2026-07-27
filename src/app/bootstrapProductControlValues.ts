/**
 * Owns bootstrap Product Control Values support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { ProductViewState } from "../ui/productViewState";
import { getLabSystemById } from "../core/labs";

export function productProfileControlValue(view: ProductViewState): string {
  return view.profile;
}

export function productUiControlValue(view: ProductViewState): string {
  return view.ui === "advanced" ? "expert" : "normal";
}

export function productLabControlValue(view: ProductViewState): string {
  return getLabSystemById(view.lab).controlValue;
}

export function productRuntimeControlValue(view: ProductViewState): string {
  return view.runtime === "reference" ? "reference" : "realtime";
}

export function setOptionalSelectValue(select: HTMLSelectElement | null, value: string): void {
  if (select) select.value = value;
}
