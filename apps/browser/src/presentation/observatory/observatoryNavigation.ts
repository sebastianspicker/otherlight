/** Connects the compact phase navigation to existing lesson state and response controls. */
import { getLessonById, getLessonStepPhases } from "../../domain/education";
import type { LessonPhaseSpec } from "../../domain/model/types";
import type { BootstrapAppState } from "../../composition/appState";
import { advanceLessonFlow, retreatLessonFlow, renderDidacticSignals } from "../labs/didactics";
import type { UiRefs } from "../shell/refs";

type Phase = "predict" | "observe" | "explain";
const OBSERVATORY_RADIUS_LESSON_ID = "kepler-geometry";
const OBSERVATORY_RADIUS_STEP_ID = "kepler-step-2";

const navPhaseFor = (lessonPhase: LessonPhaseSpec): Phase => {
  if (lessonPhase.type === "predict" || lessonPhase.type === "worked-example") return "predict";
  if (lessonPhase.type === "explain" || lessonPhase.type === "report") return "explain";
  return "observe";
};

const phaseIndexFor = (phases: LessonPhaseSpec[], phase: Phase): number => {
  const exactIndex = phases.findIndex((entry) => entry.type === phase);
  return exactIndex >= 0 ? exactIndex : phases.findIndex((entry) => navPhaseFor(entry) === phase);
};

function moveToLessonStep(
  state: BootstrapAppState,
  lesson: NonNullable<ReturnType<typeof getLessonById>>,
  stepId: string,
): void {
  const targetStepIndex = lesson.steps.findIndex((step) => step.id === stepId);
  if (targetStepIndex < 0) return;
  const maxMoves = lesson.steps.reduce(
    (count, _step, stepIndex) => count + getLessonStepPhases(lesson, stepIndex).length,
    0,
  );
  for (let moveCount = 0; state.didacticsRuntime.learning.stepIndex !== targetStepIndex; moveCount++) {
    if (moveCount >= maxMoves) return;
    const move =
      state.didacticsRuntime.learning.stepIndex < targetStepIndex ? advanceLessonFlow : retreatLessonFlow;
    state.didacticsRuntime = move(state.params, state.didacticsRuntime, state.t);
  }
}

/** Opens a disclosed destination before moving keyboard focus to its contents. */
function openObservatorySection(id: string): void {
  const target = document.getElementById(id);
  if (!target) return;
  if (target instanceof HTMLDetailsElement) target.open = true;
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  const focus = target.querySelector<HTMLElement>("summary, input:not([type=hidden]), button, select");
  focus?.focus();
  target.scrollIntoView({ block: "nearest" });
}

export function wireObservatoryNavigation(args: {
  refs: UiRefs;
  state: BootstrapAppState;
  signal: AbortSignal;
  invalidate: () => void;
  refreshDidacticSignals: () => void;
}) {
  let phase: Phase = "observe";
  let lastLearning = "";
  let followsLearningState = false;
  const rail = document.querySelector<HTMLElement>(".lab-rail");
  rail?.removeAttribute("data-product-mode");
  const buttons = document.querySelectorAll<HTMLButtonElement>("button[data-observatory-phase]");
  const interpretButton = document.getElementById("observatoryInterpretBtn") as HTMLButtonElement | null;
  const options = { signal: args.signal };

  function sync(): void {
    const learning = args.state.didacticsRuntime.learning;
    const key = `${learning.lessonId}:${learning.stepIndex}:${learning.phaseIndex}`;
    if ((args.refs.productModeSelect.value === "lab" || followsLearningState) && key !== lastLearning) {
      const lesson = getLessonById(learning.lessonId);
      const activePhase = lesson && getLessonStepPhases(lesson, learning.stepIndex)[learning.phaseIndex ?? 0];
      if (activePhase) phase = navPhaseFor(activePhase);
    }
    lastLearning = key;
    document.body.dataset.observatoryPhase = phase;
    const lesson = getLessonById(learning.lessonId);
    const phases = lesson ? getLessonStepPhases(lesson, learning.stepIndex) : [];
    for (const button of buttons) {
      const buttonPhase = button.dataset.observatoryPhase as Phase;
      button.disabled = phaseIndexFor(phases, buttonPhase) < 0;
      button.setAttribute("aria-current", button.dataset.observatoryPhase === phase ? "step" : "false");
    }
    if (interpretButton) interpretButton.disabled = phaseIndexFor(phases, "explain") < 0;
    if (rail) rail.hidden = phase === "observe" && args.refs.productModeSelect.value !== "lab";
  }

  function select(next: Phase): void {
    const { state, refs } = args;
    const lesson = getLessonById(state.didacticsRuntime.learning.lessonId);
    if (!lesson) return;
    if (
      !followsLearningState &&
      refs.productModeSelect.value === "simulation" &&
      lesson.id === OBSERVATORY_RADIUS_LESSON_ID
    ) {
      moveToLessonStep(state, lesson, OBSERVATORY_RADIUS_STEP_ID);
    }
    const phases = getLessonStepPhases(lesson, state.didacticsRuntime.learning.stepIndex);
    const index = phaseIndexFor(phases, next);
    if (index < 0) return;
    followsLearningState = true;
    while ((state.didacticsRuntime.learning.phaseIndex ?? 0) !== index) {
      const move =
        (state.didacticsRuntime.learning.phaseIndex ?? 0) < index ? advanceLessonFlow : retreatLessonFlow;
      state.didacticsRuntime = move(state.params, state.didacticsRuntime, state.t);
    }
    args.refreshDidacticSignals();
    phase = navPhaseFor(phases[index]);
    renderDidacticSignals(refs, state.didacticsRuntime);
    sync();
    args.invalidate();
    if (next !== "observe") {
      const heading = document.getElementById("didPhaseTitle");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "nearest" });
    }
  }

  for (const button of buttons)
    button.addEventListener("click", () => select(button.dataset.observatoryPhase as Phase), options);
  interpretButton?.addEventListener("click", () => select("explain"), options);
  document
    .getElementById("observatoryMoreBtn")
    ?.addEventListener("click", () => openObservatorySection("scenarioTools"), options);
  document.getElementById("observatoryAdjustLink")?.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      openObservatorySection("modelTools");
    },
    options,
  );
  sync();
  return { sync, isLearningVisible: () => phase !== "observe" };
}
