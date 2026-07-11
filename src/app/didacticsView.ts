import type {
  DidacticResponseStore,
  DidacticSignals,
  LearningState,
  LessonEventTarget,
  LessonFocusControl,
  LessonResponseMode,
  StepTimingDiagnostics,
  SystemParams,
} from "../core/types";
import { toFiniteNumber } from "../core/units";
import {
  buildLessonReportMarkdown,
  DEFAULT_LESSON_ID,
  getLessonById,
  getLessonStepPhases,
  LESSON_EVENT_TARGET_LABELS,
  LESSON_FAMILY_LABELS,
  LESSON_FOCUS_CONTROL_LABELS,
} from "../didactics";
import type { DidacticComparison } from "../didactics/compare";
import type { UiRefs } from "../ui/refs";

type DidacticsViewRuntimeState = {
  learning: LearningState;
  responses: DidacticResponseStore;
  latestSignals?: DidacticSignals;
  latestTiming?: StepTimingDiagnostics;
  latestComparison?: DidacticComparison;
  latestComparisonText?: string;
};

type HintLevel = "L1" | "L2" | "L3";

type ResponseComposerState = {
  mode: LessonResponseMode;
  response: { primary?: string; secondary?: string };
  showPrimary: boolean;
  showSecondary: boolean;
  signals: DidacticSignals | undefined;
};

type LessonSpecView = ReturnType<typeof getLessonById>;

const activePhase = (runtime: DidacticsViewRuntimeState) => {
  const lesson = getLessonById(runtime.learning.lessonId) ?? getLessonById(DEFAULT_LESSON_ID)!;
  const phases = getLessonStepPhases(lesson, runtime.learning.stepIndex);
  return phases[Math.max(0, Math.min(runtime.learning.phaseIndex ?? 0, Math.max(phases.length - 1, 0)))];
};

const currentResponseKey = (runtime: DidacticsViewRuntimeState): string => {
  const lesson = getLessonById(runtime.learning.lessonId) ?? getLessonById(DEFAULT_LESSON_ID)!;
  const step =
    lesson.steps[Math.max(0, Math.min(runtime.learning.stepIndex, Math.max(lesson.steps.length - 1, 0)))];
  const phase = activePhase(runtime);
  return `${lesson.id}:${step.id}:${phase?.id ?? "phase-0"}`;
};

const selectedHintLevel = (refs: UiRefs): HintLevel => {
  const value = refs.didHintLevelSelect?.value;
  if (value === "L1" || value === "L2" || value === "L3") return value;
  return "L1";
};

const resolveHintsForLevel = (signals: DidacticSignals | undefined, level: HintLevel): string[] => {
  if (!signals?.hintLevels) return signals?.hints ?? [];
  return signals.hintLevels[level] ?? [];
};

const resolveLessonEventSec = (
  timing: StepTimingDiagnostics | undefined,
  target: LessonEventTarget | undefined,
): number | undefined => {
  if (!timing || !target) return undefined;
  const lookup: Record<LessonEventTarget, number | undefined> = {
    planetIngress: timing.planetIngressSec,
    planetMidTransit: timing.planetTransitCenterSec,
    planetEgress: timing.planetEgressSec,
    moonIngress: timing.moonIngressSec,
    moonMidTransit: timing.moonTransitCenterSec,
    moonEgress: timing.moonEgressSec,
  };
  const value = lookup[target];
  return Number.isFinite(value) ? value : undefined;
};

const syncQuickControlFocusUi = (refs: UiRefs, focusControls: LessonFocusControl[]): void => {
  const root = refs.quickControlsRootEl;
  if (!root) return;
  const focus = new Set(focusControls);
  const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-quick-control]"));
  for (const card of cards) {
    const controlId = card.dataset.quickControl as LessonFocusControl | undefined;
    const focused = controlId ? focus.has(controlId) : false;
    card.classList.toggle("quickControl--focus", focused);
    card.classList.toggle("quickControl--dimmed", focus.size > 0 && !focused);
  }
};

const responseModeForPhase = (signals: DidacticSignals | undefined): LessonResponseMode => {
  return signals?.responseMode ?? "none";
};

const renderResponseComposer = (
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
  const mode = responseModeForPhase(signals);
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
  renderPrimaryResponseInput(refs, state);
  renderSecondaryResponseInput(refs, state);
};

const renderPrimaryResponseInput = (refs: UiRefs, state: ResponseComposerState): void => {
  const input = refs.didPrimaryResponseInput;
  if (!input) return;
  input.hidden = !state.showPrimary;
  input.disabled = !state.showPrimary;
  input.placeholder = state.signals?.responsePrimaryPlaceholder ?? "";
  input.value = state.response.primary ?? "";
};

const renderSecondaryResponseInput = (refs: UiRefs, state: ResponseComposerState): void => {
  const input = refs.didSecondaryResponseInput;
  if (!input) return;
  input.hidden = !state.showSecondary;
  input.disabled = !state.showSecondary;
  input.placeholder = state.signals?.responseSecondaryPlaceholder ?? "";
  input.value = state.response.secondary ?? "";
};

const renderResponseHelp = (refs: UiRefs, mode: LessonResponseMode): void => {
  if (refs.didResponseHelp) {
    refs.didResponseHelp.textContent = responseHelpText(mode);
  }
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

export function renderDidacticSignalsView(refs: UiRefs, runtime: DidacticsViewRuntimeState): void {
  const signals = runtime.latestSignals;
  const lesson = getLessonById(runtime.learning.lessonId);
  const hintLevel = selectedHintLevel(refs);
  const visibleHints = resolveHintsForLevel(signals, hintLevel);

  renderLessonHeader(refs, signals);
  renderPhaseProgress(runtime, signals);
  renderPhaseText(refs, signals);
  renderInterpretation(refs, signals);
  renderWorkedExample(refs, signals);
  renderObservationList(refs, signals);
  renderResponseComposer(refs, runtime, signals);
  renderFocusList(refs, signals);
  syncQuickControlFocusUi(refs, signals?.focusControls ?? []);
  renderHintList(refs, visibleHints);
  renderMisconceptionList(refs, signals);
  renderCheckList(refs, signals);
  renderFormulaList(refs, signals);
  renderEventTargetSelect(refs, runtime, signals, lesson);
  syncLessonNavigationControls(refs, runtime, lesson);
}

const renderPhaseProgress = (
  runtime: DidacticsViewRuntimeState,
  signals: DidacticSignals | undefined,
): void => {
  const progress = typeof document === "undefined" ? null : document.getElementById("didProgress");
  if (!progress) return;
  const lesson = getLessonById(runtime.learning.lessonId) ?? getLessonById(DEFAULT_LESSON_ID)!;
  const phases = getLessonStepPhases(lesson, runtime.learning.stepIndex);
  const phaseIndex = Math.max(0, Math.min(runtime.learning.phaseIndex ?? 0, Math.max(phases.length - 1, 0)));
  const stepNumber = Math.max(0, runtime.learning.stepIndex) + 1;
  progress.textContent = signals
    ? `Step ${stepNumber} of ${lesson.steps.length} · Phase ${phaseIndex + 1} of ${Math.max(phases.length, 1)}`
    : "Choose a lesson to begin.";
};

const renderLessonHeader = (refs: UiRefs, signals: DidacticSignals | undefined): void => {
  if (refs.didLessonStatus) refs.didLessonStatus.textContent = lessonStatusText(signals);
  if (refs.didLessonSummary) refs.didLessonSummary.textContent = lessonSummaryText(signals);
  if (refs.didLessonMeta) refs.didLessonMeta.textContent = lessonMetaText(signals);
};

const lessonStatusText = (signals: DidacticSignals | undefined): string => {
  if (!signals) return "Didactics disabled.";
  const score = (toFiniteNumber(signals.score, 0) * 100).toFixed(0);
  const rubric = signals.rubricV2 ? ` · rubric ${(signals.rubricV2.score * 100).toFixed(0)}%` : "";
  const family = signals.lessonFamily ? LESSON_FAMILY_LABELS[signals.lessonFamily] : "Lesson";
  return `${family} · ${signals.lessonTitle ?? "Lesson"} · ${signals.stepTitle ?? ""} · ${signals.phaseTitle ?? ""} · score ${score}%${rubric}`;
};

const lessonSummaryText = (signals: DidacticSignals | undefined): string => {
  return signals
    ? `${signals.lessonSummary ?? ""} Goal: ${signals.teachingGoal ?? ""}`
    : "No active lesson summary.";
};

const lessonMetaText = (signals: DidacticSignals | undefined): string => {
  if (!signals) return "";
  return `family ${lessonFamilyLabel(signals)} · surface ${signals.signalSurface ?? "physical"} · recommended UI ${signals.recommendedUiMode ?? "normal"} · focus ${lessonFocusText(signals)} · vocabulary ${lessonVocabularyText(signals)}`;
};

const lessonFamilyLabel = (signals: DidacticSignals): string => {
  return signals.lessonFamily ? LESSON_FAMILY_LABELS[signals.lessonFamily] : "Lesson";
};

const lessonFocusText = (signals: DidacticSignals): string => {
  const focusControls = signals.focusControls ?? [];
  if (focusControls.length === 0) return "no focused quick controls";
  return focusControls.map((id) => LESSON_FOCUS_CONTROL_LABELS[id] ?? id).join(" · ");
};

const lessonVocabularyText = (signals: DidacticSignals): string => {
  return signals.learnerVocabulary && signals.learnerVocabulary.length > 0
    ? signals.learnerVocabulary.join(", ")
    : "n/a";
};

const renderPhaseText = (refs: UiRefs, signals: DidacticSignals | undefined): void => {
  if (refs.didPhaseTitle) {
    refs.didPhaseTitle.textContent = signals?.phaseTitle
      ? `${signals.phaseTitle} [${signals.phaseType ?? "phase"}]`
      : "No active lesson phase.";
  }
  if (refs.didPhasePrompt) {
    refs.didPhasePrompt.textContent = signals?.phasePrompt ?? signals?.prompt ?? "No active lesson prompt.";
  }
};

const renderInterpretation = (refs: UiRefs, signals: DidacticSignals | undefined): void => {
  if (!refs.didInterpretation) return;
  if (!signals?.interpretation) {
    refs.didInterpretation.textContent = "";
    refs.didInterpretation.hidden = true;
    return;
  }
  refs.didInterpretation.hidden = false;
  refs.didInterpretation.textContent = `What happened: ${signals.interpretation.headline} What it means: ${signals.interpretation.observation} Next action: ${signals.interpretation.nextAction}`;
};

const renderWorkedExample = (refs: UiRefs, signals: DidacticSignals | undefined): void => {
  const container = refs.didWorkedExample;
  if (!container) return;
  container.replaceChildren();
  if (!signals?.workedExample) {
    container.hidden = true;
    return;
  }
  const title = document.createElement("strong");
  title.textContent = signals.workedExample.title;
  const body = document.createElement("div");
  body.textContent = signals.workedExample.body;
  const takeaway = document.createElement("div");
  takeaway.className = "help";
  takeaway.textContent = `Takeaway: ${signals.workedExample.takeaway}`;
  container.append(title, body, takeaway);
  container.hidden = false;
};

const renderObservationList = (refs: UiRefs, signals: DidacticSignals | undefined): void => {
  if (!refs.didObservationList) return;
  const checklist = signals?.phaseChecklist ?? [];
  refs.didObservationList.hidden = checklist.length === 0;
  renderPlainRows(
    refs.didObservationList,
    checklist.map((item) => `Observe: ${item}`),
  );
};

const renderFocusList = (refs: UiRefs, signals: DidacticSignals | undefined): void => {
  if (!refs.didFocusList) return;
  const focusControls = signals?.focusControls ?? [];
  refs.didFocusList.hidden = focusControls.length === 0;
  const rows = focusControls.map(
    (controlId) => `Focus control: ${LESSON_FOCUS_CONTROL_LABELS[controlId] ?? controlId}`,
  );
  renderPlainRows(refs.didFocusList, rows);
};

const renderHintList = (refs: UiRefs, visibleHints: string[]): void => {
  if (!refs.didHintList) return;
  refs.didHintList.hidden = visibleHints.length === 0;
  renderPlainRows(refs.didHintList, visibleHints);
};

const renderMisconceptionList = (refs: UiRefs, signals: DidacticSignals | undefined): void => {
  if (!refs.didMisconceptionList) return;
  const misconceptions = signals?.misconceptions ?? [];
  refs.didMisconceptionList.hidden = misconceptions.length === 0;
  const rows = misconceptions.map((misconception) => `[${misconception.severity}] ${misconception.message}`);
  renderPlainRows(refs.didMisconceptionList, rows);
};

const renderPlainRows = (container: HTMLElement, rows: string[]): void => {
  container.replaceChildren();
  for (const text of rows) {
    const row = document.createElement("div");
    row.textContent = text;
    container.appendChild(row);
  }
};

const renderCheckList = (refs: UiRefs, signals: DidacticSignals | undefined): void => {
  const container = refs.didCheckList;
  if (!container) return;
  container.replaceChildren();
  const checks = signals?.checks ?? [];
  container.hidden = checks.length === 0;
  for (const check of checks) {
    appendCheckRows(container, check);
  }
};

const appendCheckRows = (
  container: HTMLElement,
  check: NonNullable<DidacticSignals["checks"]>[number],
): void => {
  const row = document.createElement("div");
  row.className = `check-item ${check.passed ? "check-pass" : "check-fail"}`;
  row.textContent = `${check.passed ? "On target" : "Still adjusting"} · ${check.statusText ?? check.label}`;
  container.appendChild(row);
  const detail = document.createElement("div");
  detail.className = "help";
  detail.textContent = `Observed ${check.observed ?? "n/a"} · Expected ${check.expected ?? "n/a"}`;
  container.appendChild(detail);
};

const renderFormulaList = (refs: UiRefs, signals: DidacticSignals | undefined): void => {
  const container = refs.didFormulaList;
  if (!container) return;
  container.replaceChildren();
  const formulas = signals?.formulas ?? [];
  container.hidden = formulas.length === 0;
  for (const formula of formulas) {
    const row = document.createElement("div");
    row.textContent = formulaRowText(formula);
    container.appendChild(row);
  }
};

const formulaRowText = (formula: NonNullable<DidacticSignals["formulas"]>[number]): string => {
  const unitText = formula.unit ? ` ${formula.unit}` : "";
  return `${formula.title}: ${formula.latex} = ${formula.value}${unitText}`;
};

const renderEventTargetSelect = (
  refs: UiRefs,
  runtime: DidacticsViewRuntimeState,
  signals: DidacticSignals | undefined,
  lesson: LessonSpecView,
): void => {
  const select = refs.didEventTargetSelect;
  if (!select) return;
  const previousSelection = select.value;
  select.replaceChildren();
  const targets = eventTargetsFor(signals, lesson);
  if (targets.length === 0) appendNoEventTargetOption(select);
  for (const target of targets) appendEventTargetOption(select, runtime.latestTiming, target);
  restoreEventTargetSelection(select, previousSelection);
};

const eventTargetsFor = (
  signals: DidacticSignals | undefined,
  lesson: LessonSpecView,
): LessonEventTarget[] => {
  const defaultTargets = signals?.eventTargets ?? lesson?.eventTargets ?? [];
  if (!signals?.phaseEventTarget) return defaultTargets;
  return [
    signals.phaseEventTarget,
    ...defaultTargets.filter((target) => target !== signals.phaseEventTarget),
  ];
};

const appendNoEventTargetOption = (select: HTMLSelectElement): void => {
  const option = document.createElement("option");
  option.value = "";
  option.textContent = "No timed lesson events";
  option.disabled = true;
  option.selected = true;
  select.appendChild(option);
};

const appendEventTargetOption = (
  select: HTMLSelectElement,
  timing: StepTimingDiagnostics | undefined,
  target: LessonEventTarget,
): void => {
  const option = document.createElement("option");
  const seconds = resolveLessonEventSec(timing, target);
  option.value = target;
  option.textContent = eventTargetLabel(target, seconds);
  option.disabled = seconds === undefined;
  select.appendChild(option);
};

const eventTargetLabel = (target: LessonEventTarget, seconds: number | undefined): string => {
  return seconds === undefined
    ? `${LESSON_EVENT_TARGET_LABELS[target]} (not available yet)`
    : `${LESSON_EVENT_TARGET_LABELS[target]} @ ${seconds.toFixed(0)} s`;
};

const restoreEventTargetSelection = (select: HTMLSelectElement, previousSelection: string): void => {
  const previousOption = Array.from(select.options).find(
    (option) => option.value === previousSelection && !option.disabled,
  );
  const nextOption = previousOption ?? Array.from(select.options).find((option) => !option.disabled);
  if (nextOption) select.value = nextOption.value;
};

const syncLessonNavigationControls = (
  refs: UiRefs,
  runtime: DidacticsViewRuntimeState,
  lesson: LessonSpecView,
): void => {
  syncJumpEventButton(refs, runtime);
  if (refs.didPrevBtn) {
    refs.didPrevBtn.disabled = runtime.learning.stepIndex === 0 && (runtime.learning.phaseIndex ?? 0) === 0;
  }
  if (refs.didNextBtn) refs.didNextBtn.textContent = nextButtonText(runtime, lesson);
};

const syncJumpEventButton = (refs: UiRefs, runtime: DidacticsViewRuntimeState): void => {
  if (!refs.didJumpEventBtn) return;
  const target = refs.didEventTargetSelect?.value as LessonEventTarget | undefined;
  refs.didJumpEventBtn.disabled =
    !target || resolveLessonEventSec(runtime.latestTiming, target) === undefined;
};

const nextButtonText = (runtime: DidacticsViewRuntimeState, lesson: LessonSpecView): string => {
  const activeLessonSpec = lesson ?? getLessonById(DEFAULT_LESSON_ID);
  const stepCount = activeLessonSpec?.steps.length ?? 1;
  const phases = activeLessonSpec ? getLessonStepPhases(activeLessonSpec, runtime.learning.stepIndex) : [];
  const atLastPhase = (runtime.learning.phaseIndex ?? 0) >= Math.max(phases.length - 1, 0);
  const atLastStep = runtime.learning.stepIndex >= stepCount - 1;
  return atLastPhase ? (atLastStep ? "Restart lesson" : "Next step") : "Next phase";
};

export function exportDidacticReportView(system: SystemParams, runtime: DidacticsViewRuntimeState): void {
  const md = buildLessonReportMarkdown({
    courseTitle: "Exoplanet/Exomoon Guided Lab Report",
    state: runtime.learning,
    latestSignals: runtime.latestSignals,
    responses: runtime.responses,
    latestComparison: runtime.latestComparison,
    latestComparisonText: runtime.latestComparisonText,
  });
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lesson-report-${system.didactics?.activeLessonId ?? "default"}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function renderDidacticComparisonView(refs: UiRefs, text: string): void {
  if (refs.didCompareOut) refs.didCompareOut.textContent = text;
}

export function resolveSelectedDidacticEventTimeView(
  runtime: DidacticsViewRuntimeState,
  refs: UiRefs,
): number | undefined {
  const target = refs.didEventTargetSelect?.value as LessonEventTarget | undefined;
  return resolveLessonEventSec(runtime.latestTiming, target);
}
