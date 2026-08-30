/** Lazily resolves DOM references without retaining removed-control identifiers. */
import type { UiRefs } from "./refsTypes";

const refAliases: Record<string, string> = {
  overrideModeEl: "overrideMode",
  sliderRootEl: "sliderRoot",
  quickControlsRootEl: "quickControlsRoot",
};

function resolveRef(key: string): HTMLElement | null {
  return document.getElementById(refAliases[key] ?? key);
}

export function createUiRefs(): UiRefs {
  return new Proxy({} as UiRefs, {
    get(_target, prop) {
      return typeof prop === "string" ? resolveRef(prop) : undefined;
    },
    has(_target, prop) {
      return typeof prop === "string" && resolveRef(prop) !== null;
    },
  });
}

export const uiRefs = createUiRefs();
