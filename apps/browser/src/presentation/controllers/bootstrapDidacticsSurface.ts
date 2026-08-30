/**
 * Owns bootstrap Didactics Surface support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { UiRefs } from "../ui/refs";
import { renderDidacticSignals, type DidacticsRuntimeState } from "./didactics";

export const renderBootstrapDidacticsSurface = (
  refs: UiRefs,
  runtime: DidacticsRuntimeState,
  labModeActive: boolean,
): void => {
  if (labModeActive) {
    renderDidacticSignals(refs, runtime);
    return;
  }
  renderDidacticSignals(refs, { ...runtime, latestSignals: undefined, latestTiming: undefined });
};
