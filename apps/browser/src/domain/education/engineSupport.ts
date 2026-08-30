/**
 * Owns engine Support support within the didactics layer. Keeps learning-flow behavior independent of simulation execution.
 */
import type {
  AssessmentRubricV2,
  DidacticCheckResult,
  DidacticSignals,
  DidacticInterpretation,
  LessonPhaseSpec,
  LessonSpec,
  RubricCriterionV2,
} from "../model/types";
import type { NumericSignals } from "./engineNumericSignals";
import { getLessonStepPhases } from "./lessons";

export { collectNumericSignals } from "./engineNumericSignals";

type LessonCheckRule = LessonSpec["steps"][number]["checks"][number];

const DEFAULT_RUBRIC_CRITERIA: RubricCriterionV2[] = [
  { id: "check-pass-rate", label: "Check pass rate", weight: 0.7, metric: "check-pass-rate" },
  {
    id: "depth-consistency",
    label: "Physical transit-depth consistency",
    weight: 0.3,
    metric: "depth-consistency",
  },
];

const PASSED_STATUS_BY_SIGNAL: Partial<Record<LessonCheckRule["signal"], string>> = {
  bPlanet: "The main transit chord is in the target geometry.",
  bMoon: "The moon is crossing the star from the learner's line of sight.",
  moonLeadLagSec: "The moon signal is temporally separated from the planet dip.",
  combinedFluxDrop: "The combined stellar light curve shows a measurable eclipse.",
  rvStar: "The stellar reflex velocity is large enough to be discussed.",
  tdvRatio: "Transit timing or duration is no longer static.",
};

// Pre-computed hint levels for all 8 boolean input combinations.
// buildHintLevels is called once per frame; memoizing by (checksFailed × bPlanetFinite × depthMismatch)
// eliminates three array allocations per call while keeping the return type stable (stored references
// in DidacticSignals are safe since cached objects are never mutated).
const _hintLevelsCache = new Map<string, { L1: string[]; L2: string[]; L3: string[] }>();

function hasDepthMismatch(params: { depthApprox: number; depthObserved: number }): boolean {
  return (
    Number.isFinite(params.depthApprox) &&
    Number.isFinite(params.depthObserved) &&
    Math.abs(params.depthObserved - params.depthApprox) > 0.2
  );
}

function emptyHintLevels(): { L1: string[]; L2: string[]; L3: string[] } {
  return { L1: [], L2: [], L3: [] };
}

function appendInvalidGeometryHints(out: { L1: string[]; L2: string[]; L3: string[] }): void {
  out.L1.push("Check observer direction, inclination, and whether the body is in front of the star.");
  out.L2.push("Bring the orbit into a front-of-star transit geometry before adjusting radii.");
  out.L3.push("Invalid b indicates that physical transit geometry is unavailable at this step.");
}

function appendFailedCheckHints(out: { L1: string[]; L2: string[]; L3: string[] }): void {
  out.L1.push("Change one parameter and re-check the curve.");
  out.L2.push("Compare physical vs measured mode after each parameter change.");
  out.L3.push(
    "Track depth_theory=(Rp/Rs)^2 against the physical transit depth to isolate geometry vs noise effects.",
  );
}

function appendDepthMismatchHints(out: { L1: string[]; L2: string[]; L3: string[] }): void {
  out.L2.push("Large depth mismatch suggests limb-darkening or non-central transit effects.");
  out.L3.push("Inspect ingress/egress curvature and impact parameter before tuning planet radius.");
}

function appendDefaultHints(out: { L1: string[]; L2: string[]; L3: string[] }): void {
  if (out.L1.length === 0) out.L1.push("All checks currently pass.");
  if (out.L2.length === 0) out.L2.push("Use A/B compare to confirm causal signal changes.");
  if (out.L3.length === 0) out.L3.push("Export report and validate rubric consistency across steps.");
}

/**
 * Build tiered hint strings for the current didactics state.
 *
 * Results are memoized by the three boolean inputs (8 possible combinations) so
 * repeated calls with the same state incur no allocation cost.
 */
export function buildHintLevels(params: {
  checksFailed: boolean;
  bPlanetFinite: boolean;
  depthApprox: number;
  depthObserved: number;
}): { L1: string[]; L2: string[]; L3: string[] } {
  const depthMismatch = hasDepthMismatch(params);
  const key = `${params.checksFailed}:${params.bPlanetFinite}:${depthMismatch}`;
  const hit = _hintLevelsCache.get(key);
  if (hit) return hit;

  const out = emptyHintLevels();
  if (!params.bPlanetFinite) appendInvalidGeometryHints(out);
  if (params.checksFailed) appendFailedCheckHints(out);
  if (depthMismatch) appendDepthMismatchHints(out);
  appendDefaultHints(out);

  _hintLevelsCache.set(key, out);
  return out;
}

/**
 * Derive a list of common misconceptions the learner might hold, based on current signals.
 * Returns an empty array when the state is pedagogically clear.
 */
export function buildMisconceptions(params: {
  bPlanetFinite: boolean;
  depthApprox: number;
  depthObserved: number;
}): Array<{ id: string; message: string; severity: "info" | "warn" }> {
  const out: Array<{ id: string; message: string; severity: "info" | "warn" }> = [];
  if (!params.bPlanetFinite) {
    out.push({
      id: "impact-undefined",
      message: "Assuming a valid impact parameter while front-of-star transit geometry is unavailable.",
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

/**
 * Produce a one-sentence status message for a single lesson check,
 * suitable for display in the lesson progress panel.
 */
function passedCheckStatus(signal: LessonCheckRule["signal"]): string {
  return PASSED_STATUS_BY_SIGNAL[signal] ?? "This lesson check currently passes.";
}

function failedRangeStatus(rule: LessonCheckRule, observed: number, expected: string): string {
  if (rule.signal === "bPlanet")
    return `Move the main chord closer to the stellar center. Target ${expected}.`;
  if (rule.signal === "bMoon") {
    return `Tilt the moon orbit back toward a front-of-star crossing. Target ${expected}.`;
  }
  if (rule.signal === "combinedFluxDrop") {
    return `The eclipse is still too shallow to read clearly. Current drop ${observed.toFixed(3)}; target ${expected}.`;
  }
  return `Keep adjusting until the observed value fits ${expected}.`;
}

function failedCheckStatus(rule: LessonCheckRule, observed: number, expected: string): string {
  if (rule.kind === "range") return failedRangeStatus(rule, observed, expected);
  if (rule.kind === "distance" && rule.signal === "moonLeadLagSec") {
    return "Increase moon spacing until the moon dip leads or trails the planet more clearly.";
  }
  if (rule.kind === "signal-approx") {
    return "The measured lesson signal still does not match the geometric prediction closely enough.";
  }
  return `This check still fails. Compare observed=${Number.isFinite(observed) ? observed.toFixed(3) : "n/a"} with ${expected}.`;
}

export function buildCheckStatusText(
  rule: LessonCheckRule,
  passed: boolean,
  observed: number,
  expected: string,
): string {
  return passed ? passedCheckStatus(rule.signal) : failedCheckStatus(rule, observed, expected);
}

/**
 * Map the current lesson, check results, and numeric signals to a structured
 * {@link DidacticInterpretation} with a headline, observation sentence, and next action.
 */
type InterpretationEvaluation = ReturnType<typeof evaluateChecks>;

function interpretKepler(
  evalResult: InterpretationEvaluation,
  signals: NumericSignals,
): DidacticInterpretation {
  if (!Number.isFinite(signals.bPlanet)) {
    return {
      headline: "There is no front-of-star planet transit yet.",
      observation: "The current observer/chord geometry does not produce a valid planet impact parameter.",
      nextAction: "Raise the planet inclination until the planet crosses the visible stellar disk.",
    };
  }
  if (evalResult.stepId === "kepler-step-1") {
    return signals.bPlanet <= 0.2
      ? {
          headline: "You reached a near-central transit.",
          observation: `The planet impact parameter is ${signals.bPlanet.toFixed(2)}, so the chord stays close to the stellar center.`,
          nextAction: "Keep this geometry and now compare the physical depth against (Rp/R*)^2.",
        }
      : {
          headline: "The transit is still too grazing.",
          observation: `The current impact parameter is ${signals.bPlanet.toFixed(2)}, so the chord is still too far from the center.`,
          nextAction: "Increase planet inclination to push the chord inward.",
        };
  }
  return Math.abs(signals.depthObserved - signals.depthApprox) <= 0.2
    ? {
        headline: "Geometry and depth now tell the same story.",
        observation: `The physical depth ${signals.depthObserved.toFixed(3)} is close to the geometric estimate ${signals.depthApprox.toFixed(3)}.`,
        nextAction:
          "Use ingress and egress to explain why central transits best match the simple radius-ratio formula.",
      }
    : {
        headline: "The depth still disagrees with the simple radius-ratio estimate.",
        observation: `Observed depth ${signals.depthObserved.toFixed(3)} differs from the geometric estimate ${signals.depthApprox.toFixed(3)}.`,
        nextAction:
          "Inspect whether the chord is grazing or whether limb darkening is changing the occulted brightness.",
      };
}

function interpretExomoon(
  evalResult: InterpretationEvaluation,
  signals: NumericSignals,
): DidacticInterpretation {
  if (evalResult.stepId === "exomoon-step-1") {
    return Number.isFinite(signals.bMoon) && signals.bMoon <= 1.1
      ? {
          headline: "The moon is now in front-of-star geometry.",
          observation: `The moon impact parameter is ${signals.bMoon.toFixed(2)}, so the moon can contribute its own transit feature.`,
          nextAction:
            "Now separate the moon timing from the planet timing so the moon feature becomes readable.",
        }
      : {
          headline: "The moon is still missing the stellar disk.",
          observation: "Its projected chord is still too tilted or too far from the visible stellar disk.",
          nextAction: "Reduce moon inclination until the moon also crosses in front of the star.",
        };
  }
  return Number.isFinite(signals.moonLeadLagSec) && Math.abs(signals.moonLeadLagSec) >= 600
    ? {
        headline: "The moon signal is no longer buried inside the planet dip.",
        observation: `The moon transit center is offset from the planet by ${signals.moonLeadLagSec.toFixed(0)} s.`,
        nextAction:
          "Compare moon-on versus moon-off to identify which shoulder or dip belongs to the moon alone.",
      }
    : {
        headline: "The moon signal still overlaps too strongly with the planet transit.",
        observation:
          "The moon and planet are still transiting too close together in time to separate cleanly.",
        nextAction: "Increase moon spacing so the moon leads or trails the planet more clearly.",
      };
}

function interpretBinary(
  evalResult: InterpretationEvaluation,
  signals: NumericSignals,
): DidacticInterpretation {
  if (evalResult.stepId === "binary-step-1") {
    return signals.combinedFluxDrop >= 0.01
      ? {
          headline: "The combined light curve now shows a readable stellar eclipse.",
          observation: `The total binary flux drops by ${(signals.combinedFluxDrop * 100).toFixed(1)}% from the combined baseline.`,
          nextAction:
            "Use the eclipse chord and the reveal-sky step to decide whether the event is central or grazing.",
        }
      : {
          headline: "The binary eclipse is still too shallow to teach from cleanly.",
          observation:
            "The combined stellar flux has not dropped enough yet to make the eclipse morphology obvious.",
          nextAction: "Stay near eclipse and compare the black-box curve to the revealed geometry.",
        };
  }
  return Number.isFinite(signals.bPlanet) && signals.bPlanet <= 0.4
    ? {
        headline: "The binary eclipse chord is close to central.",
        observation: `The projected impact parameter proxy is ${signals.bPlanet.toFixed(2)}, so the occulting chord is no longer grazing.`,
        nextAction:
          "Relate the deeper eclipse to both geometry and the luminosity contrast between the two stars.",
      }
    : {
        headline: "The binary eclipse is still geometrically grazing.",
        observation: `The projected chord remains too far from the center (b ≈ ${Number.isFinite(signals.bPlanet) ? signals.bPlanet.toFixed(2) : "n/a"}).`,
        nextAction:
          "Use the reveal-sky step to compare your flux-only hypothesis against the actual eclipse chord.",
      };
}

function interpretCurveReading(signals: NumericSignals): DidacticInterpretation {
  return signals.depthObserved > 0
    ? {
        headline: "The curve landmarks are readable.",
        observation:
          "The physical curve contains a visible drop and recovery, so ingress, mid-transit, and egress can be named from evidence rather than guesswork.",
        nextAction:
          "Use the event jumps and describe exactly what changes first on the curve and on the stellar disk at each landmark.",
      }
    : {
        headline: "There is no readable transit landmark yet.",
        observation:
          "Without an active physical transit, the light curve does not yet support landmark-based reading.",
        nextAction: "Restore a visible transit before trying to identify ingress, mid-transit, and egress.",
      };
}

function interpretLimbDarkening(signals: NumericSignals): DidacticInterpretation {
  return signals.depthObserved > 0
    ? {
        headline: "You have a visible transit to study limb darkening.",
        observation:
          "The lesson surface is ready: ingress, egress, and depth can now be compared against the geometric prediction.",
        nextAction:
          "Switch to expert mode and increase u1/u2, then compare ingress/egress shape rather than only depth.",
      }
    : {
        headline: "There is no useful transit shape to study yet.",
        observation:
          "Without an active transit, limb-darkening changes will not produce a readable ingress/egress signature.",
        nextAction: "Restore a visible transit first, then strengthen limb darkening in expert mode.",
      };
}

function interpretDefault(signals: NumericSignals): DidacticInterpretation {
  return signals.rvStar > 0.01
    ? {
        headline: "The system now shows a measurable dynamical signal.",
        observation: `|RV*| is ${signals.rvStar.toFixed(3)} m/s and TDV ratio is ${Number.isFinite(signals.tdvRatio) ? signals.tdvRatio.toFixed(4) : "n/a"}.`,
        nextAction:
          "Compare this setup against an unperturbed one to separate timing effects from pure photometry.",
      }
    : {
        headline: "The perturbation is still too subtle.",
        observation:
          "The current setup has not yet produced a strong enough RV or timing deviation to teach from clearly.",
        nextAction: "Increase perturber mass or shorten the relevant orbital timescale in expert mode.",
      };
}

export function buildInterpretation(
  lesson: LessonSpec,
  evalResult: InterpretationEvaluation,
  signals: NumericSignals,
): DidacticInterpretation {
  switch (lesson.id) {
    case "kepler-geometry":
      return interpretKepler(evalResult, signals);
    case "exomoon-transit-lab":
      return interpretExomoon(evalResult, signals);
    case "binary-eclipse-lab":
      return interpretBinary(evalResult, signals);
    case "curve-reading-lab":
      return interpretCurveReading(signals);
    case "limb-darkening-lab":
      return interpretLimbDarkening(signals);
    default:
      return interpretDefault(signals);
  }
}

export function currentStepPhases(lesson: LessonSpec, stepIndex: number): LessonPhaseSpec[] {
  return getLessonStepPhases(lesson, stepIndex);
}

export function clampIndex(value: number | undefined, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value as number, max));
}

/**
 * Evaluate all rubric checks for the current lesson step against `signals`.
 * Returns per-check results, an aggregate score [0, 1], pass flag, and step metadata.
 */
export function evaluateChecks(
  lesson: LessonSpec,
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
  const safeIndex = Math.max(0, Math.min(stepIndex, Math.max(lesson.steps.length - 1, 0)));
  const step = lesson.steps[safeIndex];
  const checks: DidacticCheckResult[] = [];
  let passedCount = 0;

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
    } else if (rule.kind === "signal-approx") {
      const reference = signals[rule.referenceSignal];
      const delta = Math.abs(observed - reference);
      passed =
        Number.isFinite(observed) &&
        Number.isFinite(reference) &&
        Number.isFinite(delta) &&
        delta <= rule.tolerance;
      expected = `${rule.referenceSignal} ± ${rule.tolerance}`;
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
      statusText: buildCheckStatusText(rule, passed, observed, expected),
    });
    if (passed) passedCount += 1;
  }

  const score = checks.length > 0 ? passedCount / checks.length : 0;

  return {
    checks,
    score,
    allChecksPassed: checks.length > 0 && passedCount === checks.length,
    stepId: step.id,
    stepTitle: step.title,
    prompt: step.prompt,
  };
}

export function evaluateRubricV2(args: {
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
      : DEFAULT_RUBRIC_CRITERIA;
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

  const breakdown: Array<{ id: string; label: string; weight: number; score: number }> = [];
  let weightSum = 0;
  let weightedScore = 0;
  for (const criterion of criteria) {
    const weight =
      Number.isFinite(criterion.weight) && criterion.weight > 0 ? (criterion.weight as number) : 0;
    if (weight <= 0) continue;
    const score = scoreForMetric(criterion.metric);
    breakdown.push({
      id: criterion.id,
      label: criterion.label,
      weight,
      score,
    });
    weightSum += weight;
    weightedScore += score * weight;
  }
  if (breakdown.length === 0 || weightSum <= 0) return undefined;

  const score = weightedScore / weightSum;
  return {
    score,
    pass: score >= passScore,
    passScore,
    breakdown,
  };
}
