/** Renders lesson text, feedback, and supporting teaching content. */
import type { DidacticSignals, LessonFocusControl } from "../../domain/model/types";
import { toFiniteNumber } from "../../domain/model/units";
import {
  DEFAULT_LESSON_ID,
  getLessonById,
  getLessonStepPhases,
  LESSON_FAMILY_LABELS,
  LESSON_FOCUS_CONTROL_LABELS,
} from "../../domain/education";
import type { UiRefs } from "../shell/refs";
import type { DidacticsViewRuntimeState } from "./didacticsViewNavigation";

type HintLevel = "L1" | "L2" | "L3";

export const selectedHintLevel = (refs: UiRefs): HintLevel => {
  const value = refs.didHintLevelSelect?.value;
  if (value === "L1" || value === "L2" || value === "L3") return value;
  return "L1";
};

export const resolveHintsForLevel = (signals: DidacticSignals | undefined, level: HintLevel): string[] => {
  if (!signals?.hintLevels) return signals?.hints ?? [];
  return signals.hintLevels[level] ?? [];
};

export const renderLessonHeader = (refs: UiRefs, signals: DidacticSignals | undefined): void => {
  if (refs.didLessonStatus) refs.didLessonStatus.textContent = lessonStatusText(signals);
  if (refs.didLessonSummary) refs.didLessonSummary.textContent = lessonSummaryText(signals);
  if (refs.didLessonMeta) renderLessonVocabulary(refs.didLessonMeta, signals);
};

export const renderPhaseProgress = (
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

export const renderLessonPreResponseContent = (refs: UiRefs, signals: DidacticSignals | undefined): void => {
  renderPhaseText(refs, signals);
  renderInterpretation(refs, signals);
  renderWorkedExample(refs, signals);
  renderObservationList(refs, signals);
};

export const renderLessonPostResponseContent = (
  refs: UiRefs,
  signals: DidacticSignals | undefined,
  visibleHints: string[],
): void => {
  renderFocusList(refs, signals);
  syncQuickControlFocusUi(refs, signals?.focusControls ?? []);
  renderHintList(refs, visibleHints);
  renderMisconceptionList(refs, signals);
  renderCheckList(refs, signals);
  renderFormulaList(refs, signals);
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

const renderLessonVocabulary = (container: HTMLElement, signals: DidacticSignals | undefined): void => {
  container.replaceChildren();
  const vocabulary = signals?.learnerVocabulary ?? [];
  container.hidden = vocabulary.length === 0;
  for (const term of vocabulary) {
    const tag = document.createElement("span");
    tag.className = "lab-vocab-tag";
    tag.textContent = term;
    container.append(tag);
  }
};

const renderPhaseText = (refs: UiRefs, signals: DidacticSignals | undefined): void => {
  if (refs.didPhaseTitle) refs.didPhaseTitle.textContent = signals?.phaseTitle ?? "No active lesson phase.";
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
  const container = refs.didObservationList;
  if (!container) return;
  const checklist = signals?.phaseChecklist ?? [];
  container.hidden = checklist.length === 0;
  renderPlainRows(
    container,
    checklist.map((item) => `Observe: ${item}`),
  );
};

const renderFocusList = (refs: UiRefs, signals: DidacticSignals | undefined): void => {
  const container = refs.didFocusList;
  if (!container) return;
  const focusControls = signals?.focusControls ?? [];
  container.hidden = focusControls.length === 0;
  renderPlainRows(
    container,
    focusControls.map((controlId) => `Focus control: ${LESSON_FOCUS_CONTROL_LABELS[controlId] ?? controlId}`),
  );
};

const syncQuickControlFocusUi = (refs: UiRefs, focusControls: LessonFocusControl[]): void => {
  const root = refs.quickControlsRootEl;
  if (!root) return;
  const focus = new Set(focusControls);
  for (const card of Array.from(root.querySelectorAll<HTMLElement>("[data-quick-control]"))) {
    const controlId = card.dataset.quickControl as LessonFocusControl | undefined;
    const focused = controlId ? focus.has(controlId) : false;
    card.classList.toggle("quickControl--focus", focused);
    card.classList.toggle("quickControl--dimmed", focus.size > 0 && !focused);
  }
};

const renderHintList = (refs: UiRefs, visibleHints: string[]): void => {
  if (!refs.didHintList) return;
  refs.didHintList.hidden = visibleHints.length === 0;
  renderPlainRows(refs.didHintList, visibleHints);
};

const renderMisconceptionList = (refs: UiRefs, signals: DidacticSignals | undefined): void => {
  const container = refs.didMisconceptionList;
  if (!container) return;
  const misconceptions = signals?.misconceptions ?? [];
  container.hidden = misconceptions.length === 0;
  renderPlainRows(
    container,
    misconceptions.map((item) => `[${item.severity}] ${item.message}`),
  );
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
  for (const check of checks) appendCheckRows(container, check);
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
    const unitText = formula.unit ? ` ${formula.unit}` : "";
    row.textContent = `${formula.title}: ${formula.latex} = ${formula.value}${unitText}`;
    container.appendChild(row);
  }
};
