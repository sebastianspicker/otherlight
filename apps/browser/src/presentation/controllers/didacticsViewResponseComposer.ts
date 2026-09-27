/** Renders the lesson response inputs without owning lesson navigation. */
import type { DidacticSignals, LessonResponseMode } from "../../domain/model/types";
import type { UiRefs } from "../ui/refs";
import { currentResponseKey, type DidacticsViewRuntimeState } from "./didacticsViewNavigation";

type ResponseComposerState = {
  mode: LessonResponseMode;
  response: { primary?: string; secondary?: string };
  showPrimary: boolean;
  showSecondary: boolean;
  signals: DidacticSignals | undefined;
};

export const renderResponseComposer = (
  refs: UiRefs,
  runtime: DidacticsViewRuntimeState,
  signals: DidacticSignals | undefined,
): void => {
  const state = responseComposerState(runtime, signals);
  if (refs.didResponseComposer) {
    refs.didResponseComposer.hidden = state.mode === "none" || state.mode === "hypothesis-select";
  }
  renderResponseLabels(refs, state);
  renderResponseInputs(refs, state);
  renderResponseHelp(refs, state.mode);
};

const responseComposerState = (
  runtime: DidacticsViewRuntimeState,
  signals: DidacticSignals | undefined,
): ResponseComposerState => {
  const mode = signals?.responseMode ?? "none";
  const response = runtime.responses[currentResponseKey(runtime)] ?? {};
  const showPrimary = mode !== "none" && mode !== "hypothesis-select";
  const showSecondary =
    (mode === "claim-reason" || mode === "explanation-notes") &&
    Boolean(signals?.responseSecondaryLabel || signals?.responseSecondaryPlaceholder);
  return { mode, response, showPrimary, showSecondary, signals };
};

const renderResponseLabels = (refs: UiRefs, state: ResponseComposerState): void => {
  if (refs.didPrimaryResponseLabel) {
    refs.didPrimaryResponseLabel.textContent =
      state.mode === "hypothesis-select"
        ? "Use the hypothesis selector above"
        : (state.signals?.responsePrimaryLabel ?? "Response");
  }
  if (refs.didSecondaryResponseLabel) {
    refs.didSecondaryResponseLabel.textContent = state.signals?.responseSecondaryLabel ?? "Reason / evidence";
    refs.didSecondaryResponseLabel.hidden = !state.showSecondary;
  }
};

const renderResponseInputs = (refs: UiRefs, state: ResponseComposerState): void => {
  const primary = refs.didPrimaryResponseInput;
  if (primary) {
    primary.hidden = !state.showPrimary;
    primary.disabled = !state.showPrimary;
    primary.placeholder = state.signals?.responsePrimaryPlaceholder ?? "";
    primary.value = state.response.primary ?? "";
  }

  const secondary = refs.didSecondaryResponseInput;
  if (secondary) {
    secondary.hidden = !state.showSecondary;
    secondary.disabled = !state.showSecondary;
    secondary.placeholder = state.signals?.responseSecondaryPlaceholder ?? "";
    secondary.value = state.response.secondary ?? "";
  }
};

const renderResponseHelp = (refs: UiRefs, mode: LessonResponseMode): void => {
  if (!refs.didResponseHelp) return;
  refs.didResponseHelp.textContent = responseHelpText(mode);
};

const responseHelpText = (mode: LessonResponseMode): string => {
  if (mode === "hypothesis-select") {
    return "This phase uses the Binary Lab hypothesis selector instead of a text answer.";
  }
  if (mode === "none") {
    return "This phase is for studying the worked example or reading the current feedback.";
  }
  return "Responses are stored in the lesson runtime and exported with the lesson report.";
};
