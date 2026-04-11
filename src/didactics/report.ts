import type { DidacticResponseStore, DidacticSignals, LearningState } from "../core/types";
import type { DidacticComparison } from "./compare";

export function buildLessonReportMarkdown(params: {
  courseTitle: string;
  state: LearningState;
  latestSignals?: DidacticSignals;
  responses?: DidacticResponseStore;
  latestComparison?: DidacticComparison;
  latestComparisonText?: string;
}): string {
  const { courseTitle, state, latestSignals, responses, latestComparison, latestComparisonText } = params;
  const checks = latestSignals?.checks ?? [];
  const formulas = latestSignals?.formulas ?? [];

  const lines: string[] = [];
  const passedStepIds = Array.isArray(state.passedStepIds) ? state.passedStepIds : [];
  lines.push(`# ${courseTitle}`);
  lines.push("");
  lines.push(`- Lesson ID: \`${state?.lessonId ?? "unknown"}\``);
  lines.push(`- Lesson Title: ${latestSignals?.lessonTitle ?? "n/a"}`);
  lines.push(`- Lesson Family: ${latestSignals?.lessonFamily ?? "n/a"}`);
  lines.push(`- Step Index: ${Number.isFinite(state?.stepIndex) ? state.stepIndex : 0}`);
  lines.push(`- Phase Index: ${Number.isFinite(state?.phaseIndex) ? state.phaseIndex : 0}`);
  lines.push(`- Passed Steps: ${passedStepIds.length > 0 ? passedStepIds.join(", ") : "none"}`);
  lines.push(`- Last Score: ${state?.lastScore ?? 0}`);
  lines.push(`- Signal Surface: ${latestSignals?.signalSurface ?? "physical"}`);
  lines.push(`- Recommended UI: ${latestSignals?.recommendedUiMode ?? "normal"}`);
  lines.push("");
  lines.push("## Lesson Framing");
  lines.push(`- Summary: ${latestSignals?.lessonSummary ?? "n/a"}`);
  lines.push(`- Teaching goal: ${latestSignals?.teachingGoal ?? "n/a"}`);
  lines.push(
    `- Focus controls: ${
      latestSignals?.focusControls && latestSignals.focusControls.length > 0
        ? latestSignals.focusControls.join(", ")
        : "none"
    }`,
  );
  lines.push(
    `- Learner vocabulary: ${
      latestSignals?.learnerVocabulary && latestSignals.learnerVocabulary.length > 0
        ? latestSignals.learnerVocabulary.join(", ")
        : "none"
    }`,
  );
  lines.push("");
  lines.push("## Interpretation");
  if (!latestSignals?.interpretation) {
    lines.push("- no interpretation");
  } else {
    lines.push(`- What happened: ${latestSignals.interpretation.headline}`);
    lines.push(`- What it means: ${latestSignals.interpretation.observation}`);
    lines.push(`- Next action: ${latestSignals.interpretation.nextAction}`);
  }
  lines.push("");
  lines.push("## Active Lesson Phase");
  lines.push(`- Phase: ${latestSignals?.phaseTitle ?? "n/a"} (${latestSignals?.phaseType ?? "n/a"})`);
  lines.push(`- Prompt: ${latestSignals?.phasePrompt ?? latestSignals?.prompt ?? "n/a"}`);
  if (latestSignals?.phaseChecklist && latestSignals.phaseChecklist.length > 0) {
    lines.push("- Observation checklist:");
    for (const item of latestSignals.phaseChecklist) lines.push(`  - ${item}`);
  }
  if (latestSignals?.workedExample) {
    lines.push("- Worked example:");
    lines.push(`  - ${latestSignals.workedExample.title}`);
    lines.push(`  - ${latestSignals.workedExample.body}`);
    lines.push(`  - Takeaway: ${latestSignals.workedExample.takeaway}`);
  }
  lines.push("");
  lines.push("## Learner Responses");
  const responseEntries = Object.entries(responses ?? {}).filter(([key]) =>
    key.startsWith(`${state?.lessonId ?? ""}:`),
  );
  if (responseEntries.length === 0) {
    lines.push("- no saved learner responses");
  } else {
    for (const [key, value] of responseEntries) {
      lines.push(`- ${key}`);
      if (value.primary) lines.push(`  - Primary: ${value.primary}`);
      if (value.secondary) lines.push(`  - Secondary: ${value.secondary}`);
    }
  }
  lines.push("");
  lines.push("## A/B Comparison");
  if (latestComparison) {
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
    if (
      typeof latestComparison.rvPlanetDelta === "number" &&
      Number.isFinite(latestComparison.rvPlanetDelta)
    ) {
      lines.push(`- ΔrvPlanet: ${latestComparison.rvPlanetDelta.toExponential(3)}`);
    }
  }
  if (latestComparisonText) {
    lines.push(latestComparisonText);
  } else if (latestComparison) {
    lines.push("- interpretation not recorded");
  } else {
    lines.push("- no comparison recorded");
  }
  lines.push("");
  lines.push("## Latest Check Results");
  if (checks.length === 0) {
    lines.push("- no checks");
  } else {
    for (const c of checks) {
      lines.push(
        `- [${c.passed ? "x" : " "}] ${c.label} (observed=${c.observed ?? "n/a"}, expected=${c.expected ?? "n/a"})`,
      );
      if (c.statusText) lines.push(`  note: ${c.statusText}`);
    }
  }
  lines.push("");
  lines.push("## Formula Cards");
  if (formulas.length === 0) {
    lines.push("- no formulas");
  } else {
    for (const f of formulas) {
      lines.push(`- ${f.title}: ${f.latex} = ${f.value}${f.unit ? ` ${f.unit}` : ""}`);
    }
  }
  lines.push("");
  lines.push("## Hints");
  if (!latestSignals?.hints || latestSignals.hints.length === 0) {
    lines.push("- no hints");
  } else {
    for (const h of latestSignals.hints) lines.push(`- ${h}`);
  }
  lines.push("");
  lines.push("## Misconceptions");
  if (!latestSignals?.misconceptions || latestSignals.misconceptions.length === 0) {
    lines.push("- no misconception flags");
  } else {
    for (const m of latestSignals.misconceptions) {
      lines.push(`- [${m.severity}] ${m.message}`);
    }
  }

  return lines.join("\n");
}
