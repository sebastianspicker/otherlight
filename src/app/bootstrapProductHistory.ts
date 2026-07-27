/**
 * Owns bootstrap Product History support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { ProductViewState } from "../ui/productViewState";
import { productViewStateSearch } from "../ui/productViewState";

type ProductHistoryWriterArgs = {
  isRestoring: () => boolean;
  readState: () => ProductViewState;
};

export function createProductHistoryWriter(args: ProductHistoryWriterArgs) {
  return (kind: "push" | "replace"): void => {
    if (typeof window === "undefined" || args.isRestoring()) return;
    const search = productViewStateSearch(args.readState(), new URLSearchParams(window.location.search));
    const nextUrl = `${window.location.pathname}?${search}${window.location.hash}`;
    try {
      if (kind === "push") window.history.pushState(null, "", nextUrl);
      else window.history.replaceState(null, "", nextUrl);
    } catch {
      // History can be unavailable in embedded/file contexts; state remains local.
    }
  };
}
