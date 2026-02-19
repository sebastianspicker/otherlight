import type {
  AssessmentRubricV2,
  DidacticCheckResult,
  DidacticSignals,
  LearningState,
  RubricCriterionV2,
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

function buildHintLevels(params: {
  checksFailed: boolean;
  bPlanetFinite: boolean;
  depthApprox: number;
  depthObserved: number;
}): { L1: string[]; L2: string[]; L3: string[] } {
  const out = { L1: [] as string[], L2: [] as string[], L3: [] as string[] };
  if (!params.bPlanetFinite) {
    out.L1.push("Check observer direction and orbital inclination.");
    out.L2.push("Set observer dir close to edge-on geometry before adjusting radii.");
    out.L3.push("Invalid b indicates sky-plane projection degeneracy; re-normalize observer vector.");
  }
  if (params.checksFailed) {
    out.L1.push("Change one parameter and re-check the curve.");
    out.L2.push("Compare physical vs measured mode after each parameter change.");
    out.L3.push("Track depth_theory=(Rp/Rs)^2 against depth_obs to isolate geometry vs noise effects.");
  }
  const d = Math.abs(params.depthObserved - params.depthApprox);
  if (Number.isFinite(d) && d > 0.2) {
    out.L2.push("Large depth mismatch suggests limb-darkening or non-central transit effects.");
    out.L3.push("Inspect ingress/egress curvature and impact parameter before tuning planet radius.");
  }
  if (out.L1.length === 0) out.L1.push("All checks currently pass.");
  if (out.L2.length === 0) out.L2.push("Use A/B compare to confirm causal signal changes.");
  if (out.L3.length === 0) out.L3.push("Export report and validate rubric consistency across steps.");
  return out;
}

function buildMisconceptions(params: {
  bPlanetFinite: boolean;
  depthApprox: number;
  depthObserved: number;
}): Array<{ id: string; message: string; severity: "info" | "warn" }> {
  const out: Array<{ id: string; message: string; severity: "info" | "warn" }> = [];
  if (!params.bPlanetFinite) {
    out.push({
      id: "impact-undefined",
      message: "Assuming a valid impact parameter while observer geometry is undefined.",
      severity: "warn",
    });
  }
  const d = Math.abs(params.depthObserved - params.depthApprox);
  if (Number.isFinite(d) && d > 0.2) {
    out.push({
      id: "depth-equals-ratio",
      message: "Depth is treated as purely (Rp/Rs)^2 although limb-darkening/geometry can dominate.",
      severity: "info",
    });
  }
  return out;
}

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

function defaultRubricCriteria(): RubricCriterionV2[] {
  return [
    { id: "check-pass-rate", label: "Check pass rate", weight: 0.6, metric: "check-pass-rate" },
    { id: "depth-consistency", label: "Depth consistency", weight: 0.25, metric: "depth-consistency" },
    { id: "timing-signal", label: "Timing signal awareness", weight: 0.15, metric: "timing-signal" },
  ];
}

function evaluateRubricV2(args: {
  rubric?: AssessmentRubricV2;
  checksScore: number;
  depthApprox: number;
  depthObserved: number;
  tdvRatio: number;
}): DidacticSignals["rubricV2"] | undefined {
  const enabled = args.rubric?.enabled ?? true;
  if (!enabled) return undefined;
  const criteria =
    Array.isArray(args.rubric?.criteria) && args.rubric!.criteria!.length > 0
      ? args.rubric!.criteria!
      : defaultRubricCriteria();
  const passScore = Number.isFinite(args.rubric?.passScore)
    ? Math.min(1, Math.max(0, args.rubric!.passScore as number))
    : 0.7;

  const scoreForMetric = (metric: RubricCriterionV2["metric"]): number => {
    if (metric === "check-pass-rate") return Math.min(1, Math.max(0, args.checksScore));
    if (metric === "depth-consistency") {
      const delta = Math.abs(args.depthObserved - args.depthApprox);
      return Math.max(0, 1 - Math.min(1, delta));
    }
    const tdvDelta = Number.isFinite(args.tdvRatio) ? Math.abs(args.tdvRatio - 1) : 0;
    return Math.min(1, tdvDelta * 10);
  };

  const safe = criteria
    .map((c) => ({
      id: c.id,
      label: c.label,
      weight: Number.isFinite(c.weight) && c.weight > 0 ? (c.weight as number) : 0,
      score: scoreForMetric(c.metric),
    }))
    .filter((c) => c.weight > 0);
  if (safe.length === 0) return undefined;

  const weightSum = safe.reduce((s, c) => s + c.weight, 0);
  const score = safe.reduce((s, c) => s + c.score * c.weight, 0) / weightSum;
  return {
    score,
    pass: score >= passScore,
    passScore,
    breakdown: safe,
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

  const hintLevels = buildHintLevels({
    checksFailed: !evalResult.allChecksPassed,
    bPlanetFinite: Number.isFinite(numeric.bPlanet),
    depthApprox: numeric.depthApprox,
    depthObserved: numeric.depthObserved,
  });
  const preferredLevel = system.didactics.hintLevel ?? "L2";
  const selectedHints =
    preferredLevel === "L1" ? hintLevels.L1 : preferredLevel === "L3" ? hintLevels.L3 : hintLevels.L2;
  const misconceptions =
    system.didactics.misconceptionChecks?.enabled !== false
      ? buildMisconceptions({
          bPlanetFinite: Number.isFinite(numeric.bPlanet),
          depthApprox: numeric.depthApprox,
          depthObserved: numeric.depthObserved,
        })
      : [];
  const rubricV2 = evaluateRubricV2({
    rubric: system.didactics.assessmentRubricV2,
    checksScore: evalResult.score,
    depthApprox: numeric.depthApprox,
    depthObserved: numeric.depthObserved,
    tdvRatio: numeric.tdvRatio,
  });

  return {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    stepId: evalResult.stepId,
    stepTitle: evalResult.stepTitle,
    prompt: evalResult.prompt,
    hints: [...hints, ...selectedHints],
    hintLevels,
    misconceptions,
    rubricV2,
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
