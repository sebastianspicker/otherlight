import type {
  DidacticCheckResult,
  DidacticSignals,
  LearningState,
  StepResult,
  SystemParams,
} from "../core/types";
import { toFiniteNumber } from "../core/units";
import { DEFAULT_LESSON_ID, getLessonById } from "./lessons";

type NumericSignals = {
  bPlanet: number;
  fluxTransitFactor: number;
  tdvRatio: number;
  rvStar: number;
  rvPlanet: number;
  depthApprox: number;
  depthObserved: number;
};

function collectNumericSignals(system: SystemParams, step: StepResult): NumericSignals {
  const rs = toFiniteNumber(system.star.r, 1);
  const rp = toFiniteNumber(system.planet.r, 0);
  const depthApprox = rs > 0 ? (rp / rs) ** 2 : 0;
  const fluxTransitFactor = toFiniteNumber(step.fluxTransitFactor, 1);
  const depthObserved = Math.max(0, 1 - fluxTransitFactor);

  const rvStar = Math.abs(toFiniteNumber(step.meta?.observables?.rvStar, 0));
  const rvPlanet = Math.abs(toFiniteNumber(step.meta?.observables?.rvPlanet, 0));

  return {
    bPlanet: toFiniteNumber(step.meta?.bPlanet, Number.NaN),
    fluxTransitFactor,
    tdvRatio: toFiniteNumber(step.meta?.tdvRatio, Number.NaN),
    rvStar,
    rvPlanet,
    depthApprox,
    depthObserved,
  };
}

function evaluateChecks(
  lessonId: string,
  stepIndex: number,
  signals: NumericSignals,
): {
  checks: DidacticCheckResult[];
  score: number;
  allChecksPassed: boolean;
  stepId: string;
  stepTitle: string;
  prompt: string;
} {
  const lesson = getLessonById(lessonId);
  const safeIndex = Math.max(0, Math.min(stepIndex, Math.max(lesson.steps.length - 1, 0)));
  const step = lesson.steps[safeIndex];
  const checks: DidacticCheckResult[] = [];

  for (const rule of step.checks) {
    const observed = signals[rule.signal];
    let passed: boolean;
    let expected: string;

    if (rule.kind === "range") {
      const minOk = rule.min === undefined || observed >= rule.min;
      const maxOk = rule.max === undefined || observed <= rule.max;
      passed = Number.isFinite(observed) && minOk && maxOk;
      expected = `[${rule.min ?? "-inf"}, ${rule.max ?? "+inf"}]`;
    } else if (rule.kind === "approx") {
      const delta = Math.abs(observed - rule.target);
      passed = Number.isFinite(observed) && Number.isFinite(delta) && delta <= rule.tolerance;
      expected = `${rule.target} ± ${rule.tolerance}`;
    } else {
      const delta = Math.abs(observed - rule.target);
      passed = Number.isFinite(observed) && Number.isFinite(delta) && delta >= rule.minAbsDelta;
      expected = `|x-${rule.target}| >= ${rule.minAbsDelta}`;
    }

    checks.push({
      id: rule.id,
      label: rule.label,
      passed,
      observed: Number.isFinite(observed) ? observed : undefined,
      expected,
    });
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const score = checks.length > 0 ? passedCount / checks.length : 1;

  return {
    checks,
    score,
    allChecksPassed: passedCount === checks.length,
    stepId: step.id,
    stepTitle: step.title,
    prompt: step.prompt,
  };
}

export function resolveLearningState(system: SystemParams, tSec: number): LearningState {
  const did = system.didactics;
  const lesson = getLessonById(did?.activeLessonId ?? DEFAULT_LESSON_ID);
  const prev = did?.learningState;
  if (!prev || prev.lessonId !== lesson.id) {
    return {
      lessonId: lesson.id,
      stepIndex: 0,
      passedStepIds: [],
      updatedAtSec: tSec,
    };
  }
  return {
    lessonId: prev.lessonId,
    stepIndex: Math.max(0, Math.min(prev.stepIndex, Math.max(lesson.steps.length - 1, 0))),
    passedStepIds: Array.isArray(prev.passedStepIds) ? prev.passedStepIds.slice() : [],
    lastScore: prev.lastScore,
    updatedAtSec: prev.updatedAtSec,
  };
}

export function computeDidacticSignals(system: SystemParams, step: StepResult): DidacticSignals | undefined {
  if (!system.didactics?.enabled) return undefined;

  const lesson = getLessonById(system.didactics.activeLessonId ?? DEFAULT_LESSON_ID);
  const state = resolveLearningState(system, toFiniteNumber(step.meta?.t, 0));
  const numeric = collectNumericSignals(system, step);
  const evalResult = evaluateChecks(lesson.id, state.stepIndex, numeric);
  const hints: string[] = [];

  if (!Number.isFinite(numeric.bPlanet)) {
    hints.push("Impact parameter is undefined; check observer direction and orbit geometry.");
  }
  if (!evalResult.allChecksPassed) {
    hints.push("Adjust one control at a time, then compare physical vs measured plot mode.");
  }

  return {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    stepId: evalResult.stepId,
    stepTitle: evalResult.stepTitle,
    prompt: evalResult.prompt,
    hints,
    score: evalResult.score,
    allChecksPassed: evalResult.allChecksPassed,
    checks: evalResult.checks,
    formulas: [
      {
        id: "depth-approx",
        title: "Geometric depth approximation",
        latex: "\\delta_{\\mathrm{geom}} \\approx \\left(\\frac{R_p}{R_*}\\right)^2",
        value: numeric.depthApprox,
        unit: "1",
      },
      {
        id: "depth-observed",
        title: "Observed depth",
        latex: "\\delta_{\\mathrm{obs}} = 1 - F_{\\mathrm{transit}}",
        value: numeric.depthObserved,
        unit: "1",
      },
      {
        id: "impact-parameter",
        title: "Impact parameter proxy",
        latex: "b \\approx \\frac{|y_p|}{R_*}",
        value: numeric.bPlanet,
        unit: "1",
      },
    ],
  };
}

export function advanceLearningState(
  state: LearningState,
  didacticSignals: DidacticSignals | undefined,
  autoAdvance: boolean,
  tSec: number,
): LearningState {
  if (!didacticSignals) return state;
  const next = {
    ...state,
    lastScore: didacticSignals.score,
    updatedAtSec: tSec,
  };
  const stepId = didacticSignals.stepId;
  if (didacticSignals.allChecksPassed && stepId && !next.passedStepIds.includes(stepId)) {
    next.passedStepIds = [...next.passedStepIds, stepId];
    if (autoAdvance) {
      const lesson = getLessonById(state.lessonId);
      const maxStep = Math.max(lesson.steps.length - 1, 0);
      next.stepIndex = Math.min(maxStep, state.stepIndex + 1);
    }
  }
  return next;
}
