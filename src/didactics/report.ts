import type { DidacticSignals, LearningState } from "../core/types";

export function buildLessonReportMarkdown(params: {
  courseTitle: string;
  state: LearningState;
  latestSignals?: DidacticSignals;
}): string {
  const { courseTitle, state, latestSignals } = params;
  const checks = latestSignals?.checks ?? [];
  const formulas = latestSignals?.formulas ?? [];

  const lines: string[] = [];
  lines.push(`# ${courseTitle}`);
  lines.push("");
  lines.push(`- Lesson ID: \`${state.lessonId}\``);
  lines.push(`- Step Index: ${state.stepIndex}`);
  lines.push(`- Passed Steps: ${state.passedStepIds.length > 0 ? state.passedStepIds.join(", ") : "none"}`);
  lines.push(`- Last Score: ${state.lastScore ?? 0}`);
  lines.push("");
  lines.push("## Latest Check Results");
  if (checks.length === 0) {
    lines.push("- no checks");
  } else {
    for (const c of checks) {
      lines.push(
        `- [${c.passed ? "x" : " "}] ${c.label} (observed=${c.observed ?? "n/a"}, expected=${c.expected ?? "n/a"})`,
      );
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

  return lines.join("\n");
}
