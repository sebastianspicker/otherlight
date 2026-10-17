/**
 * Warns before the tab closes or reloads while work exists only in memory:
 * Guided Lab responses written since the last workspace save or open, or
 * advanced parameter edits that were never applied.
 */
import type { DidacticResponseStore } from "../../domain/model/types";

type UnloadGuardArgs = {
  responses: () => DidacticResponseStore;
  hasUnappliedEdits: () => boolean;
  signal: AbortSignal;
};

export type UnloadGuard = {
  /** Records the current responses as saved, after a workspace save or open. */
  markSaved: () => void;
};

/** Response text only: timestamps change on every edit and do not count as work. */
function responseText(responses: DidacticResponseStore): string {
  const written = Object.entries(responses)
    .map(([key, entry]) => [key, entry.primary?.trim() ?? "", entry.secondary?.trim() ?? ""])
    .filter(([, primary, secondary]) => primary !== "" || secondary !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(written);
}

export function wireUnloadGuard(args: UnloadGuardArgs): UnloadGuard {
  let savedText = responseText(args.responses());
  window.addEventListener(
    "beforeunload",
    (event) => {
      if (!args.hasUnappliedEdits() && responseText(args.responses()) === savedText) return;
      event.preventDefault();
    },
    { signal: args.signal },
  );
  return {
    markSaved: () => {
      savedText = responseText(args.responses());
    },
  };
}
