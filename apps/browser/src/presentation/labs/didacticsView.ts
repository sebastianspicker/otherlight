/** Owns didactics view orchestration and its stable controller exports. */
import type { BrowserScenarioDraft } from "../../domain/model/types";
import { buildLessonReportMarkdown } from "../../domain/education";
import {
  renderLessonHeader,
  renderLessonPostResponseContent,
  renderLessonPreResponseContent,
  renderPhaseProgress,
  resolveHintsForLevel,
  selectedHintLevel,
} from "./didacticsViewLessonContent";
import {
  renderLessonNavigation,
  resolveSelectedDidacticEventTime,
  type DidacticsViewRuntimeState,
} from "./didacticsViewNavigation";
import { renderResponseComposer } from "./didacticsViewResponseComposer";
import type { UiRefs } from "../shell/refs";

export type { DidacticsViewRuntimeState } from "./didacticsViewNavigation";

export function renderDidacticSignalsView(refs: UiRefs, runtime: DidacticsViewRuntimeState): void {
  const signals = runtime.latestSignals;
  const visibleHints = resolveHintsForLevel(signals, selectedHintLevel(refs));

  renderLessonHeader(refs, signals);
  renderPhaseProgress(runtime, signals);
  renderLessonPreResponseContent(refs, signals);
  renderResponseComposer(refs, runtime, signals);
  renderLessonPostResponseContent(refs, signals, visibleHints);
  renderLessonNavigation(refs, runtime, signals);
}

export function exportDidacticReportView(
  system: BrowserScenarioDraft,
  runtime: DidacticsViewRuntimeState,
): void {
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
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `lesson-report-${system.didactics?.activeLessonId ?? "default"}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function renderDidacticComparisonView(refs: UiRefs, text: string): void {
  if (refs.didCompareOut) refs.didCompareOut.textContent = text;
}

export function resolveSelectedDidacticEventTimeView(
  runtime: DidacticsViewRuntimeState,
  refs: UiRefs,
): number | undefined {
  return resolveSelectedDidacticEventTime(runtime, refs);
}
