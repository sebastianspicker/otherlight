import type { DidacticResponseStore, DidacticSignals, LearningState } from "../core/types";
import type { DidacticComparison } from "./compare";

type ReportChecks = NonNullable<DidacticSignals["checks"]>;
type ReportFormulas = NonNullable<DidacticSignals["formulas"]>;

type LessonReportMarkdownParams = {
  courseTitle: string;
  state: LearningState;
  latestSignals?: DidacticSignals;
  responses?: DidacticResponseStore;
  latestComparison?: DidacticComparison;
  latestComparisonText?: string;
};

const passedStepIds = (state: LearningState): string[] => {
  return Array.isArray(state.passedStepIds) ? state.passedStepIds : [];
};

const appendLessonHeader = (lines: string[], params: LessonReportMarkdownParams): void => {
  const { courseTitle, state, latestSignals } = params;
  const passedIds = passedStepIds(state);

  lines.push(`# ${courseTitle}`);
  lines.push("");
  lines.push(`- Lesson ID: \`${state?.lessonId ?? "unknown"}\``);
  lines.push(`- Lesson Title: ${latestSignals?.lessonTitle ?? "n/a"}`);
  lines.push(`- Lesson Family: ${latestSignals?.lessonFamily ?? "n/a"}`);
  lines.push(`- Step Index: ${Number.isFinite(state?.stepIndex) ? state.stepIndex : 0}`);
  lines.push(`- Phase Index: ${Number.isFinite(state?.phaseIndex) ? state.phaseIndex : 0}`);
  lines.push(`- Passed Steps: ${passedIds.length > 0 ? passedIds.join(", ") : "none"}`);
  lines.push(`- Last Score: ${state?.lastScore ?? 0}`);
  lines.push(`- Signal Surface: ${latestSignals?.signalSurface ?? "physical"}`);
  lines.push(`- Recommended UI: ${latestSignals?.recommendedUiMode ?? "normal"}`);
};

const commaListOrNone = (values: string[] | undefined): string => {
  return values && values.length > 0 ? values.join(", ") : "none";
};

const appendLessonFraming = (lines: string[], latestSignals: DidacticSignals | undefined): void => {
  lines.push("");
  lines.push("## Lesson Framing");
  lines.push(`- Summary: ${latestSignals?.lessonSummary ?? "n/a"}`);
  lines.push(`- Teaching goal: ${latestSignals?.teachingGoal ?? "n/a"}`);
  lines.push(`- Focus controls: ${commaListOrNone(latestSignals?.focusControls)}`);
  lines.push(`- Learner vocabulary: ${commaListOrNone(latestSignals?.learnerVocabulary)}`);
};

const appendInterpretation = (lines: string[], latestSignals: DidacticSignals | undefined): void => {
  lines.push("");
  lines.push("## Interpretation");
  if (!latestSignals?.interpretation) {
    lines.push("- no interpretation");
    return;
  }

  lines.push(`- What happened: ${latestSignals.interpretation.headline}`);
  lines.push(`- What it means: ${latestSignals.interpretation.observation}`);
  lines.push(`- Next action: ${latestSignals.interpretation.nextAction}`);
};

const appendActivePhase = (lines: string[], latestSignals: DidacticSignals | undefined): void => {
  lines.push("");
  lines.push("## Active Lesson Phase");
  lines.push(`- Phase: ${latestSignals?.phaseTitle ?? "n/a"} (${latestSignals?.phaseType ?? "n/a"})`);
  lines.push(`- Prompt: ${latestSignals?.phasePrompt ?? latestSignals?.prompt ?? "n/a"}`);
  appendPhaseChecklist(lines, latestSignals);
  appendWorkedExample(lines, latestSignals);
};

const appendPhaseChecklist = (lines: string[], latestSignals: DidacticSignals | undefined): void => {
  if (!latestSignals?.phaseChecklist || latestSignals.phaseChecklist.length === 0) return;

  lines.push("- Observation checklist:");
  for (const item of latestSignals.phaseChecklist) lines.push(`  - ${item}`);
};

const appendWorkedExample = (lines: string[], latestSignals: DidacticSignals | undefined): void => {
  if (!latestSignals?.workedExample) return;

  lines.push("- Worked example:");
  lines.push(`  - ${latestSignals.workedExample.title}`);
  lines.push(`  - ${latestSignals.workedExample.body}`);
  lines.push(`  - Takeaway: ${latestSignals.workedExample.takeaway}`);
};

const appendLearnerResponses = (
  lines: string[],
  state: LearningState,
  responses: DidacticResponseStore | undefined,
): void => {
  lines.push("");
  lines.push("## Learner Responses");

  const responseEntries = Object.entries(responses ?? {}).filter(([key]) =>
    key.startsWith(`${state?.lessonId ?? ""}:`),
  );
  if (responseEntries.length === 0) {
    lines.push("- no saved learner responses");
    return;
  }

  for (const [key, value] of responseEntries) {
    lines.push(`- ${key}`);
    if (value.primary) lines.push(`  - Primary: ${value.primary}`);
    if (value.secondary) lines.push(`  - Secondary: ${value.secondary}`);
  }
};

const appendComparisonScalars = (lines: string[], latestComparison: DidacticComparison): void => {
  lines.push(`- Time: ${latestComparison.tSec}s`);
  lines.push(`- ΔfluxTotal: ${latestComparison.fluxTotalDelta.toExponential(3)}`);
  if (
    typeof latestComparison.fluxDisplayDelta === "number" &&
    Number.isFinite(latestComparison.fluxDisplayDelta)
  ) {
    lines.push(`- ΔfluxDisplay: ${latestComparison.fluxDisplayDelta.toExponential(3)}`);
  }
  lines.push(`- ΔfluxTransit: ${latestComparison.fluxTransitDelta.toExponential(3)}`);
  if (typeof latestComparison.rvStarDelta === "number" && Number.isFinite(latestComparison.rvStarDelta)) {
    lines.push(`- ΔrvStar: ${latestComparison.rvStarDelta.toExponential(3)}`);
  }
  if (typeof latestComparison.rvPlanetDelta === "number" && Number.isFinite(latestComparison.rvPlanetDelta)) {
    lines.push(`- ΔrvPlanet: ${latestComparison.rvPlanetDelta.toExponential(3)}`);
  }
};

const appendComparisonVisual = (lines: string[], latestComparison: DidacticComparison): void => {
  if (latestComparison.visual?.curveSeries?.length) {
    lines.push(
      `- Visual overlays: ${latestComparison.visual.curveSeries.map((series) => series.label).join(", ")}`,
    );
  }
  if (latestComparison.visual?.comparisonInset) {
    lines.push(`- Compare inset: ${latestComparison.visual.comparisonInset.title}`);
  }
  if (latestComparison.visual?.sceneGhosts?.length) {
    lines.push(
      `- Scene ghosts: ${latestComparison.visual.sceneGhosts.map((ghost) => ghost.label).join(", ")}`,
    );
  }
};

const appendComparison = (
  lines: string[],
  latestComparison: DidacticComparison | undefined,
  latestComparisonText: string | undefined,
): void => {
  lines.push("");
  lines.push("## A/B Comparison");
  if (latestComparison) {
    appendComparisonScalars(lines, latestComparison);
    appendComparisonVisual(lines, latestComparison);
  }

  if (latestComparisonText) {
    lines.push(latestComparisonText);
  } else if (latestComparison) {
    lines.push("- interpretation not recorded");
  } else {
    lines.push("- no comparison recorded");
  }
};

const appendCheckResults = (lines: string[], checks: ReportChecks): void => {
  lines.push("");
  lines.push("## Latest Check Results");
  if (checks.length === 0) {
    lines.push("- no checks");
    return;
  }

  for (const c of checks) {
    lines.push(
      `- [${c.passed ? "x" : " "}] ${c.label} (observed=${c.observed ?? "n/a"}, expected=${c.expected ?? "n/a"})`,
    );
    if (c.statusText) lines.push(`  note: ${c.statusText}`);
  }
};

const formulaUnitSuffix = (unit: string | undefined): string => {
  return unit ? ` ${unit}` : "";
};

const formulaCardLine = (formula: ReportFormulas[number]): string => {
  return `- ${formula.title}: ${formula.latex} = ${formula.value}${formulaUnitSuffix(formula.unit)}`;
};

const appendFormulaCards = (lines: string[], formulas: ReportFormulas): void => {
  lines.push("");
  lines.push("## Formula Cards");
  if (formulas.length === 0) {
    lines.push("- no formulas");
    return;
  }

  for (const f of formulas) {
    lines.push(formulaCardLine(f));
  }
};

const appendHints = (lines: string[], latestSignals: DidacticSignals | undefined): void => {
  lines.push("");
  lines.push("## Hints");
  if (!latestSignals?.hints || latestSignals.hints.length === 0) {
    lines.push("- no hints");
    return;
  }

  for (const h of latestSignals.hints) lines.push(`- ${h}`);
};

const appendMisconceptions = (lines: string[], latestSignals: DidacticSignals | undefined): void => {
  lines.push("");
  lines.push("## Misconceptions");
  if (!latestSignals?.misconceptions || latestSignals.misconceptions.length === 0) {
    lines.push("- no misconception flags");
    return;
  }

  for (const m of latestSignals.misconceptions) {
    lines.push(`- [${m.severity}] ${m.message}`);
  }
};

export function buildLessonReportMarkdown(params: LessonReportMarkdownParams): string {
  const { state, latestSignals, responses, latestComparison, latestComparisonText } = params;
  const checks = latestSignals?.checks ?? [];
  const formulas = latestSignals?.formulas ?? [];
  const lines: string[] = [];

  appendLessonHeader(lines, params);
  appendLessonFraming(lines, latestSignals);
  appendInterpretation(lines, latestSignals);
  appendActivePhase(lines, latestSignals);
  appendLearnerResponses(lines, state, responses);
  appendComparison(lines, latestComparison, latestComparisonText);
  appendCheckResults(lines, checks);
  appendFormulaCards(lines, formulas);
  appendHints(lines, latestSignals);
  appendMisconceptions(lines, latestSignals);

  return lines.join("\n");
}
